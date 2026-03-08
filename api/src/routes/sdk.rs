use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::models::dataset::Dataset;
use crate::services::notify::{notify, NotifyType};
use crate::AppState;

/// Local dataset storage root (PVC mounted in the API pod).
const DATASETS_DIR: &str = "/data/datasets";

/// POST /sdk/register-model
/// Called from the openmodelstudio Python SDK inside a workspace.
#[derive(Debug, serde::Deserialize)]
pub struct SdkRegisterModelRequest {
    pub name: String,
    pub framework: Option<String>,
    pub description: Option<String>,
    pub source_code: Option<String>,
    pub project_id: Option<Uuid>,
    pub registry_name: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct SdkRegisterModelResponse {
    pub model_id: Uuid,
    pub name: String,
    pub version: i32,
}

pub async fn register_model(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<SdkRegisterModelRequest>,
) -> AppResult<Json<SdkRegisterModelResponse>> {
    let framework = req.framework.unwrap_or_else(|| "pytorch".into());
    let project_id: Option<Uuid> = req.project_id.filter(|id| !id.is_nil());
    let workspace_id: Option<Uuid> = None;

    // Check if a model with the same name (or registry_name) already exists
    let existing: Option<crate::models::model::Model> = if req.registry_name.is_some() {
        if let Some(pid) = project_id {
            sqlx::query_as(
                "SELECT * FROM models WHERE registry_name = $1 AND project_id = $2 ORDER BY version DESC LIMIT 1"
            )
            .bind(&req.registry_name)
            .bind(pid)
            .fetch_optional(&state.db)
            .await?
        } else {
            sqlx::query_as(
                "SELECT * FROM models WHERE registry_name = $1 AND project_id IS NULL ORDER BY version DESC LIMIT 1"
            )
            .bind(&req.registry_name)
            .fetch_optional(&state.db)
            .await?
        }
    } else {
        if let Some(pid) = project_id {
            sqlx::query_as(
                "SELECT * FROM models WHERE name = $1 AND project_id = $2 ORDER BY version DESC LIMIT 1"
            )
            .bind(&req.name)
            .bind(pid)
            .fetch_optional(&state.db)
            .await?
        } else {
            sqlx::query_as(
                "SELECT * FROM models WHERE name = $1 AND project_id IS NULL ORDER BY version DESC LIMIT 1"
            )
            .bind(&req.name)
            .fetch_optional(&state.db)
            .await?
        }
    };

    let from_registry = req.registry_name.is_some();

    let (model_id, new_version) = if let Some(existing_model) = existing {
        // Update existing model with new version
        let new_ver = existing_model.version + 1;
        let model: crate::models::model::Model = sqlx::query_as(
            "UPDATE models SET source_code = $1, framework = $2, description = COALESCE($3, description), version = $4, registry_name = COALESCE($5, registry_name), updated_at = NOW() WHERE id = $6 RETURNING *"
        )
        .bind(&req.source_code)
        .bind(&framework)
        .bind(&req.description)
        .bind(new_ver)
        .bind(&req.registry_name)
        .bind(existing_model.id)
        .fetch_one(&state.db)
        .await?;
        (model.id, new_ver)
    } else {
        // Create new model
        let model_id = Uuid::new_v4();
        let model: crate::models::model::Model = sqlx::query_as(
            "INSERT INTO models (id, project_id, name, description, framework, source_code, version, created_by, status, language, origin_workspace_id, registry_name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 1, $7, 'draft', 'Python', $8, $9, NOW(), NOW()) RETURNING *"
        )
        .bind(model_id)
        .bind(project_id)
        .bind(&req.name)
        .bind(&req.description)
        .bind(&framework)
        .bind(&req.source_code)
        .bind(claims.sub)
        .bind(workspace_id)
        .bind(&req.registry_name)
        .fetch_one(&state.db)
        .await?;
        (model.id, 1)
    };

    // Create version entry
    if req.source_code.is_some() {
        sqlx::query(
            "INSERT INTO model_versions (id, model_id, version, source_code, created_by, workspace_id, change_summary, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())"
        )
        .bind(Uuid::new_v4())
        .bind(model_id)
        .bind(new_version)
        .bind(&req.source_code)
        .bind(claims.sub)
        .bind(workspace_id)
        .bind(if from_registry {
            if new_version == 1 { "Installed from registry" } else { "Updated from registry" }
        } else {
            if new_version == 1 { "Initial version from workspace" } else { "Updated from workspace" }
        })
        .execute(&state.db)
        .await?;
    }

    notify(&state.db, claims.sub, "Model Registered", &format!("Model '{}' v{} registered via SDK", req.name, new_version), NotifyType::Success, Some(&format!("/models/{}", model_id))).await;
    Ok(Json(SdkRegisterModelResponse {
        model_id,
        name: req.name,
        version: new_version,
    }))
}

/// POST /sdk/publish-version
/// Called from the openmodelstudio Python SDK to publish a new model version.
#[derive(Debug, serde::Deserialize)]
pub struct SdkPublishVersionRequest {
    pub model_id: Uuid,
    pub source_code: Option<String>,
    pub change_summary: Option<String>,
    pub artifact_data: Option<String>,
    pub artifact_name: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct SdkPublishVersionResponse {
    pub version_id: Uuid,
    pub version: i32,
    pub model_id: Uuid,
}

pub async fn publish_version(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<SdkPublishVersionRequest>,
) -> AppResult<Json<SdkPublishVersionResponse>> {
    // Get current model
    let model: crate::models::model::Model = sqlx::query_as(
        "SELECT * FROM models WHERE id = $1"
    )
    .bind(req.model_id)
    .fetch_one(&state.db)
    .await?;

    let new_version = model.version + 1;
    let version_id = Uuid::new_v4();

    // Determine which source code to store (new or carry forward)
    let version_code = req.source_code.as_deref().or(model.source_code.as_deref());

    // Insert new model_version
    sqlx::query(
        "INSERT INTO model_versions (id, model_id, version, source_code, created_by, workspace_id, change_summary, created_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, NOW())"
    )
    .bind(version_id)
    .bind(req.model_id)
    .bind(new_version)
    .bind(version_code)
    .bind(claims.sub)
    .bind(&req.change_summary)
    .execute(&state.db)
    .await?;

    // Update the model's current version and source code
    if let Some(ref code) = req.source_code {
        sqlx::query(
            "UPDATE models SET source_code = $2, version = $3, updated_at = NOW() WHERE id = $1"
        )
        .bind(req.model_id)
        .bind(code)
        .bind(new_version)
        .execute(&state.db)
        .await?;
    } else {
        sqlx::query("UPDATE models SET version = $2, updated_at = NOW() WHERE id = $1")
            .bind(req.model_id)
            .bind(new_version)
            .execute(&state.db)
            .await?;
    }

    notify(&state.db, claims.sub, "Version Published", &format!("Model version {} published", new_version), NotifyType::Success, Some(&format!("/models/{}", req.model_id))).await;
    Ok(Json(SdkPublishVersionResponse {
        version_id,
        version: new_version,
        model_id: req.model_id,
    }))
}

// ── SDK Dataset endpoints ───────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct SdkListDatasetsQuery {
    pub project_id: Option<Uuid>,
}

/// GET /sdk/datasets?project_id={uuid}
/// Lists datasets for the workspace's project.
pub async fn list_datasets(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(q): Query<SdkListDatasetsQuery>,
) -> AppResult<Json<Vec<Dataset>>> {
    let datasets: Vec<Dataset> = if let Some(pid) = q.project_id {
        sqlx::query_as("SELECT * FROM datasets WHERE project_id = $1 ORDER BY created_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM datasets ORDER BY created_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(datasets))
}

#[derive(Debug, serde::Serialize)]
pub struct SdkDatasetDownloadResponse {
    pub download_url: String,
    pub name: String,
    pub format: String,
}

/// GET /sdk/datasets/{id}/download-url
/// Returns a presigned S3 download URL for the dataset file.
pub async fn dataset_download_url(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<SdkDatasetDownloadResponse>> {
    let dataset: Dataset = sqlx::query_as("SELECT * FROM datasets WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    let s3_key = dataset.s3_key.ok_or_else(|| {
        crate::error::AppError::Internal("Dataset has no uploaded file".into())
    })?;

    let download_url = state
        .s3
        .presign_download(&s3_key, 3600)
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("S3 error: {e}")))?;

    Ok(Json(SdkDatasetDownloadResponse {
        download_url,
        name: dataset.name,
        format: dataset.format,
    }))
}

// ── Direct file upload/download (local PVC, no S3 required) ─────────

/// POST /sdk/datasets/{id}/upload
/// Upload file content for a dataset. Stores on the local PVC.
/// Body: { "data": "<base64-encoded file content>" }
#[derive(Debug, serde::Deserialize)]
pub struct SdkDatasetUploadRequest {
    pub data: String, // base64-encoded file content
}

pub async fn dataset_upload(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<SdkDatasetUploadRequest>,
) -> AppResult<Json<serde_json::Value>> {
    use base64::Engine;

    // Verify dataset exists
    let dataset: Dataset = sqlx::query_as("SELECT * FROM datasets WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    // Decode base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&req.data)
        .map_err(|e| AppError::BadRequest(format!("Invalid base64: {e}")))?;

    let size = bytes.len() as i64;

    // Store to local PVC
    let dir = format!("{}/{}", DATASETS_DIR, id);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Internal(format!("Failed to create dir: {e}")))?;

    let ext = dataset.format.to_lowercase();
    let file_path = format!("{}/{}.{}", dir, dataset.name, ext);
    std::fs::write(&file_path, &bytes)
        .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;

    // Update DB with local path and size
    sqlx::query(
        "UPDATE datasets SET s3_key = $2, size_bytes = $3, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(format!("local:{}", file_path))
    .bind(size)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "uploaded": true,
        "size_bytes": size,
        "path": file_path,
    })))
}

// ── SDK Create Dataset (single-step: create record + upload file) ─────

#[derive(Debug, serde::Deserialize)]
pub struct SdkCreateDatasetRequest {
    pub name: String,
    pub format: Option<String>,
    pub data: String, // base64-encoded file content
    pub project_id: Option<Uuid>,
    pub description: Option<String>,
    pub row_count: Option<i64>,
}

/// POST /sdk/create-dataset
/// Create a new dataset and upload its content in one step.
pub async fn create_dataset(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<SdkCreateDatasetRequest>,
) -> AppResult<Json<Dataset>> {
    use base64::Engine;

    let dataset_id = Uuid::new_v4();
    let format = req.format.unwrap_or_else(|| "csv".into());
    let project_id: Option<Uuid> = req.project_id.filter(|id| !id.is_nil());

    // Decode base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&req.data)
        .map_err(|e| AppError::BadRequest(format!("Invalid base64: {e}")))?;

    let size = bytes.len() as i64;

    // Store to local PVC
    let dir = format!("{}/{}", DATASETS_DIR, dataset_id);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Internal(format!("Failed to create dir: {e}")))?;

    let ext = format.to_lowercase();
    let file_path = format!("{}/{}.{}", dir, req.name, ext);
    std::fs::write(&file_path, &bytes)
        .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;

    let s3_key = format!("local:{}", file_path);

    // Create dataset record with file info
    let dataset: Dataset = sqlx::query_as(
        "INSERT INTO datasets (id, project_id, name, description, format, s3_key, size_bytes, row_count, version, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, NOW(), NOW()) RETURNING *"
    )
    .bind(dataset_id)
    .bind(project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&format)
    .bind(&s3_key)
    .bind(size)
    .bind(req.row_count)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    notify(&state.db, claims.sub, "Dataset Created", &format!("Dataset '{}' created via SDK", dataset.name), NotifyType::Success, Some(&format!("/datasets/{}", dataset.id))).await;
    Ok(Json(dataset))
}

// ── SDK Model Resolution + Artifact Download ─────────────────────────

/// GET /sdk/models/resolve/{name_or_id}
/// Resolve a model by name or UUID. Returns the Model JSON.
pub async fn resolve_model(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(name_or_id): Path<String>,
) -> AppResult<Json<crate::models::model::Model>> {
    // Try parsing as UUID first
    let model: crate::models::model::Model = if let Ok(id) = name_or_id.parse::<Uuid>() {
        sqlx::query_as("SELECT * FROM models WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model not found: {name_or_id}")))?
    } else {
        // Lookup by name (most recently created match)
        sqlx::query_as("SELECT * FROM models WHERE name = $1 ORDER BY created_at DESC LIMIT 1")
            .bind(&name_or_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model not found: {name_or_id}")))?
    };

    Ok(Json(model))
}

/// GET /sdk/models/resolve-registry/{registry_name}
/// Resolve a model by its registry_name column. Returns the full Model JSON
/// including source_code. Used by SDK use_model().
pub async fn resolve_registry_model(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(registry_name): Path<String>,
) -> AppResult<Json<crate::models::model::Model>> {
    let model: crate::models::model::Model = sqlx::query_as(
        "SELECT * FROM models WHERE registry_name = $1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&registry_name)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Registry model not found: {registry_name}")))?;

    Ok(Json(model))
}

/// GET /sdk/models/{id}/artifact
/// Serve the latest checkpoint artifact for a model, or extract the embedded
/// base64 blob from the model's source_code (for SDK-registered models).
pub async fn model_artifact(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    // Try to find the latest checkpoint artifact from any job for this model
    let artifact: Option<crate::models::artifact::Artifact> = sqlx::query_as(
        "SELECT a.* FROM artifacts a JOIN jobs j ON a.job_id = j.id
         WHERE j.model_id = $1 AND a.artifact_type = 'checkpoint'
         ORDER BY a.created_at DESC LIMIT 1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(art) = artifact {
        // Serve artifact from PVC or S3
        if let Some(local_path) = art.s3_key.strip_prefix("local:") {
            let bytes = std::fs::read(local_path)
                .map_err(|e| AppError::NotFound(format!("Artifact file not found: {e}")))?;
            return Ok((
                [(header::CONTENT_TYPE, "application/octet-stream")],
                Body::from(bytes),
            )
                .into_response());
        }
        // S3 redirect
        let url = state.s3.presign_download(&art.s3_key, 3600).await
            .map_err(|e| AppError::Internal(format!("S3 error: {e}")))?;
        return Ok((
            [(header::LOCATION, url.as_str())],
            axum::http::StatusCode::TEMPORARY_REDIRECT,
        )
            .into_response());
    }

    // No checkpoint artifact — try extracting base64 from source_code
    // (SDK-registered models embed the serialized model as _MODEL_B64)
    let model: crate::models::model::Model =
        sqlx::query_as("SELECT * FROM models WHERE id = $1")
            .bind(id)
            .fetch_one(&state.db)
            .await?;

    if let Some(ref code) = model.source_code {
        // Look for _MODEL_B64 = """...""" pattern
        if let Some(start) = code.find("_MODEL_B64 = \"\"\"") {
            let start = start + "_MODEL_B64 = \"\"\"".len();
            if let Some(end) = code[start..].find("\"\"\"") {
                let b64_str = &code[start..start + end];
                use base64::Engine;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(b64_str.trim())
                    .map_err(|e| AppError::Internal(format!("Failed to decode model blob: {e}")))?;
                return Ok((
                    [(header::CONTENT_TYPE, "application/octet-stream")],
                    Body::from(bytes),
                )
                    .into_response());
            }
        }
    }

    Err(AppError::NotFound(
        "No artifact or embedded model found. Train the model first or re-register with a model object.".into()
    ))
}

/// GET /sdk/datasets/{id}/content
/// Serve the raw dataset file. Works with local PVC storage and S3.
pub async fn dataset_content(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    let dataset: Dataset = sqlx::query_as("SELECT * FROM datasets WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    let s3_key = dataset.s3_key.as_deref().ok_or_else(|| {
        AppError::NotFound("Dataset has no uploaded file".into())
    })?;

    // Local PVC storage (prefixed with "local:")
    if let Some(local_path) = s3_key.strip_prefix("local:") {
        let bytes = std::fs::read(local_path)
            .map_err(|e| AppError::NotFound(format!("File not found: {e}")))?;

        let content_type = match dataset.format.to_lowercase().as_str() {
            "csv" => "text/csv",
            "json" | "jsonl" => "application/json",
            "parquet" => "application/octet-stream",
            _ => "application/octet-stream",
        };

        return Ok((
            [(header::CONTENT_TYPE, content_type)],
            Body::from(bytes),
        )
            .into_response());
    }

    // S3 storage — redirect to presigned URL
    let download_url = state
        .s3
        .presign_download(s3_key, 3600)
        .await
        .map_err(|e| AppError::Internal(format!("S3 error: {e}")))?;

    Ok((
        [(header::LOCATION, download_url.as_str())],
        axum::http::StatusCode::TEMPORARY_REDIRECT,
    )
        .into_response())
}

// ══════════════════════════════════════════════════════════════════════
// Phase 2: Feature Store + Hyperparameter Store
// ══════════════════════════════════════════════════════════════════════

// ── Feature Store ────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct SdkCreateFeaturesRequest {
    pub project_id: Option<Uuid>,
    pub group_name: String,
    pub entity: Option<String>,
    pub features: Vec<SdkFeatureDef>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct SdkFeatureDef {
    pub name: String,
    pub feature_type: String,
    pub dtype: Option<String>,
    pub config: Option<serde_json::Value>,
    pub description: Option<String>,
    pub null_rate: Option<f64>,
    pub mean: Option<f64>,
}

/// POST /sdk/features
/// Create a feature group with features from a workspace.
pub async fn create_features(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<SdkCreateFeaturesRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let project_id: Option<Uuid> = req.project_id.filter(|id| !id.is_nil());
    let entity = req.entity.unwrap_or_else(|| "default".into());

    // Create or find feature group
    let group_id: Uuid = match sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM feature_groups WHERE name = $1 AND (project_id = $2 OR ($2::uuid IS NULL AND project_id IS NULL))"
    )
    .bind(&req.group_name)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    {
        Some(id) => id,
        None => {
            let gid = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO feature_groups (id, project_id, name, entity, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())"
            )
            .bind(gid)
            .bind(project_id)
            .bind(&req.group_name)
            .bind(&entity)
            .bind(claims.sub)
            .execute(&state.db)
            .await?;
            gid
        }
    };

    // Insert features
    let mut created = Vec::new();
    for feat in &req.features {
        let fid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO features (id, project_id, name, description, feature_type, config, created_by, group_id, dtype, entity, null_rate, mean, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())"
        )
        .bind(fid)
        .bind(project_id)
        .bind(&feat.name)
        .bind(&feat.description)
        .bind(&feat.feature_type)
        .bind(&feat.config)
        .bind(claims.sub)
        .bind(group_id)
        .bind(&feat.dtype)
        .bind(&entity)
        .bind(feat.null_rate)
        .bind(feat.mean)
        .execute(&state.db)
        .await?;
        created.push(serde_json::json!({"id": fid, "name": feat.name}));
    }

    Ok(Json(serde_json::json!({
        "group_id": group_id,
        "group_name": req.group_name,
        "features_created": created.len(),
        "features": created,
    })))
}

/// GET /sdk/features/group/{name_or_id}
/// Load all features in a feature group by name or UUID.
pub async fn load_feature_group(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(name_or_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    // Resolve group
    let group_id: Uuid = if let Ok(id) = name_or_id.parse::<Uuid>() {
        id
    } else {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM feature_groups WHERE name = $1 ORDER BY created_at DESC LIMIT 1"
        )
        .bind(&name_or_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Feature group not found: {name_or_id}")))?
    };

    // Get group info
    let group: crate::models::notification::FeatureGroup = sqlx::query_as(
        "SELECT * FROM feature_groups WHERE id = $1"
    )
    .bind(group_id)
    .fetch_one(&state.db)
    .await?;

    // Get features
    let features: Vec<crate::models::notification::Feature> = sqlx::query_as(
        "SELECT * FROM features WHERE group_id = $1 ORDER BY name"
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "group": group,
        "features": features,
    })))
}

// ── Hyperparameter Store ─────────────────────────────────────────────

use crate::models::hyperparameters::*;

/// POST /sdk/hyperparameters
pub async fn create_hyperparameters(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateHpSetRequest>,
) -> AppResult<Json<HyperparameterSet>> {
    let id = Uuid::new_v4();
    let project_id: Option<Uuid> = req.project_id.filter(|id| !id.is_nil());

    let hp: HyperparameterSet = sqlx::query_as(
        "INSERT INTO hyperparameter_sets (id, project_id, name, description, parameters, model_id, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *"
    )
    .bind(id)
    .bind(project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.parameters)
    .bind(req.model_id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(hp))
}

#[derive(Debug, serde::Deserialize)]
pub struct SdkListHpQuery {
    pub project_id: Option<Uuid>,
}

/// GET /sdk/hyperparameters
pub async fn list_hyperparameters(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(q): Query<SdkListHpQuery>,
) -> AppResult<Json<Vec<HyperparameterSet>>> {
    let sets: Vec<HyperparameterSet> = if let Some(pid) = q.project_id {
        sqlx::query_as("SELECT * FROM hyperparameter_sets WHERE project_id = $1 ORDER BY created_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM hyperparameter_sets ORDER BY created_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(sets))
}

/// GET /sdk/hyperparameters/{name_or_id}
pub async fn get_hyperparameters(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(name_or_id): Path<String>,
) -> AppResult<Json<HyperparameterSet>> {
    let hp: HyperparameterSet = if let Ok(id) = name_or_id.parse::<Uuid>() {
        sqlx::query_as("SELECT * FROM hyperparameter_sets WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM hyperparameter_sets WHERE name = $1 ORDER BY created_at DESC LIMIT 1")
            .bind(&name_or_id)
            .fetch_optional(&state.db)
            .await?
    }
    .ok_or_else(|| AppError::NotFound(format!("Hyperparameter set not found: {name_or_id}")))?;

    Ok(Json(hp))
}

/// PUT /sdk/hyperparameters/{name_or_id}
pub async fn update_hyperparameters(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(name_or_id): Path<String>,
    Json(req): Json<UpdateHpSetRequest>,
) -> AppResult<Json<HyperparameterSet>> {
    let id: Uuid = name_or_id.parse().map_err(|_| AppError::BadRequest("UUID required for update".into()))?;
    if let Some(ref params) = req.parameters {
        sqlx::query("UPDATE hyperparameter_sets SET parameters = $2, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(params)
            .execute(&state.db)
            .await?;
    }
    if let Some(ref desc) = req.description {
        sqlx::query("UPDATE hyperparameter_sets SET description = $2, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(desc)
            .execute(&state.db)
            .await?;
    }
    let hp: HyperparameterSet = sqlx::query_as("SELECT * FROM hyperparameter_sets WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(hp))
}

/// DELETE /sdk/hyperparameters/{name_or_id}
pub async fn delete_hyperparameters(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(name_or_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let id: Uuid = name_or_id.parse().map_err(|_| AppError::BadRequest("UUID required for delete".into()))?;
    sqlx::query("DELETE FROM hyperparameter_sets WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"deleted": true})))
}

// ══════════════════════════════════════════════════════════════════════
// Phase 3: SDK Job Kickoff (start training / inference from workspace)
// ══════════════════════════════════════════════════════════════════════

#[derive(Debug, serde::Deserialize)]
pub struct SdkStartTrainingRequest {
    pub model_id: String,       // name or UUID
    pub dataset_id: Option<String>,  // name or UUID
    pub hyperparameters: Option<serde_json::Value>,
    pub hyperparameter_set: Option<String>, // name of stored HP set
    pub hardware_tier: Option<String>,
    pub experiment_id: Option<Uuid>,
}

/// Helper: resolve a model by name or UUID
async fn resolve_model_id(db: &sqlx::PgPool, name_or_id: &str) -> Result<crate::models::model::Model, AppError> {
    if let Ok(id) = name_or_id.parse::<Uuid>() {
        sqlx::query_as::<_, crate::models::model::Model>("SELECT * FROM models WHERE id = $1")
            .bind(id)
            .fetch_optional(db)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model not found: {name_or_id}")))
    } else {
        sqlx::query_as::<_, crate::models::model::Model>(
            "SELECT * FROM models WHERE name = $1 ORDER BY created_at DESC LIMIT 1"
        )
        .bind(name_or_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model not found: {name_or_id}")))
    }
}

/// Helper: resolve a dataset by name or UUID
async fn resolve_dataset_id(db: &sqlx::PgPool, name_or_id: &str) -> Result<Uuid, AppError> {
    if let Ok(id) = name_or_id.parse::<Uuid>() {
        return Ok(id);
    }
    sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM datasets WHERE name = $1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(name_or_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Dataset not found: {name_or_id}")))
}

/// POST /sdk/start-training
pub async fn start_training(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<SdkStartTrainingRequest>,
) -> AppResult<Json<crate::models::job::Job>> {
    let model = resolve_model_id(&state.db, &req.model_id).await?;
    let hardware_tier = req.hardware_tier.unwrap_or_else(|| "cpu-small".into());

    let dataset_id = if let Some(ref ds) = req.dataset_id {
        Some(resolve_dataset_id(&state.db, ds).await?)
    } else {
        None
    };

    // Resolve hyperparameters: explicit > stored set > empty
    let hyperparameters = if let Some(hp) = req.hyperparameters {
        Some(hp)
    } else if let Some(ref hp_name) = req.hyperparameter_set {
        let hp_set: HyperparameterSet = if let Ok(id) = hp_name.parse::<Uuid>() {
            sqlx::query_as("SELECT * FROM hyperparameter_sets WHERE id = $1")
                .bind(id)
                .fetch_one(&state.db)
                .await?
        } else {
            sqlx::query_as("SELECT * FROM hyperparameter_sets WHERE name = $1 ORDER BY created_at DESC LIMIT 1")
                .bind(hp_name.as_str())
                .fetch_one(&state.db)
                .await?
        };
        Some(hp_set.parameters)
    } else {
        None
    };

    let job_id = Uuid::new_v4();
    let _job: crate::models::job::Job = sqlx::query_as(
        "INSERT INTO jobs (id, project_id, model_id, dataset_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'training', 'pending', $5, $6, $7, NOW(), NOW()) RETURNING *"
    )
    .bind(job_id)
    .bind(model.project_id)
    .bind(model.id)
    .bind(dataset_id)
    .bind(&hardware_tier)
    .bind(&hyperparameters)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    // Create K8s job
    if let Some(ref k8s) = state.k8s {
        match k8s.create_training_job(
            job_id, model.id, &model.framework, &hardware_tier,
            dataset_id, hyperparameters.as_ref(), "training",
        ).await {
            Ok(k8s_name) => {
                sqlx::query("UPDATE jobs SET k8s_job_name = $2, status = 'running', started_at = NOW() WHERE id = $1")
                    .bind(job_id)
                    .bind(&k8s_name)
                    .execute(&state.db)
                    .await?;
            }
            Err(e) => {
                tracing::warn!("Failed to create K8s job: {e}");
            }
        }
    }

    // Auto-track as experiment run if experiment_id provided
    if let Some(exp_id) = req.experiment_id {
        sqlx::query(
            "INSERT INTO experiment_runs (id, experiment_id, job_id, parameters, created_at)
             VALUES ($1, $2, $3, $4, NOW())"
        )
        .bind(Uuid::new_v4())
        .bind(exp_id)
        .bind(job_id)
        .bind(&hyperparameters)
        .execute(&state.db)
        .await?;
    }

    // Re-fetch to get updated status
    let job: crate::models::job::Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1")
        .bind(job_id)
        .fetch_one(&state.db)
        .await?;

    notify(&state.db, claims.sub, "Training Started", &format!("Training started for '{}' via SDK", model.name), NotifyType::Info, Some(&format!("/training/{}", job_id))).await;
    Ok(Json(job))
}

#[derive(Debug, serde::Deserialize)]
pub struct SdkStartInferenceRequest {
    pub model_id: String,       // name or UUID
    pub input_data: Option<serde_json::Value>,
    pub dataset_id: Option<String>,
    pub hardware_tier: Option<String>,
}

/// POST /sdk/start-inference
pub async fn start_inference(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<SdkStartInferenceRequest>,
) -> AppResult<Json<crate::models::job::Job>> {
    let model = resolve_model_id(&state.db, &req.model_id).await?;
    let hardware_tier = req.hardware_tier.unwrap_or_else(|| "cpu-small".into());

    let dataset_id = if let Some(ref ds) = req.dataset_id {
        Some(resolve_dataset_id(&state.db, ds).await?)
    } else {
        None
    };

    let job_id = Uuid::new_v4();
    let _job: crate::models::job::Job = sqlx::query_as(
        "INSERT INTO jobs (id, project_id, model_id, dataset_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'inference', 'pending', $5, $6, $7, NOW(), NOW()) RETURNING *"
    )
    .bind(job_id)
    .bind(model.project_id)
    .bind(model.id)
    .bind(dataset_id)
    .bind(&hardware_tier)
    .bind(&req.input_data)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    // Create K8s job for inference
    if let Some(ref k8s) = state.k8s {
        match k8s.create_training_job(
            job_id, model.id, &model.framework, &hardware_tier,
            dataset_id, req.input_data.as_ref(), "inference",
        ).await {
            Ok(k8s_name) => {
                sqlx::query("UPDATE jobs SET k8s_job_name = $2, status = 'running', started_at = NOW() WHERE id = $1")
                    .bind(job_id)
                    .bind(&k8s_name)
                    .execute(&state.db)
                    .await?;
            }
            Err(e) => {
                tracing::warn!("Failed to create K8s inference job: {e}");
            }
        }
    }

    let job: crate::models::job::Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1")
        .bind(job_id)
        .fetch_one(&state.db)
        .await?;

    notify(&state.db, claims.sub, "Inference Started", &format!("Inference started for '{}' via SDK", model.name), NotifyType::Info, Some(&format!("/inference/{}", job_id))).await;
    Ok(Json(job))
}

// ══════════════════════════════════════════════════════════════════════
// Phase 4: Jobs listing + Pipelines
// ══════════════════════════════════════════════════════════════════════

#[derive(Debug, serde::Deserialize)]
pub struct SdkListJobsQuery {
    pub project_id: Option<Uuid>,
    pub job_type: Option<String>,
    pub status: Option<String>,
}

/// GET /sdk/jobs
pub async fn list_jobs(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(q): Query<SdkListJobsQuery>,
) -> AppResult<Json<Vec<crate::models::job::Job>>> {
    // Build dynamic query
    let mut sql = "SELECT * FROM jobs WHERE 1=1".to_string();
    if q.project_id.is_some() {
        sql.push_str(" AND project_id = $1");
    }
    // For simplicity, use a single flexible query
    let jobs: Vec<crate::models::job::Job> = if let Some(pid) = q.project_id {
        if let Some(ref jt) = q.job_type {
            sqlx::query_as("SELECT * FROM jobs WHERE project_id = $1 AND job_type = $2 ORDER BY created_at DESC")
                .bind(pid)
                .bind(jt)
                .fetch_all(&state.db)
                .await?
        } else {
            sqlx::query_as("SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC")
                .bind(pid)
                .fetch_all(&state.db)
                .await?
        }
    } else if let Some(ref jt) = q.job_type {
        sqlx::query_as("SELECT * FROM jobs WHERE job_type = $1 ORDER BY created_at DESC")
            .bind(jt)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM jobs ORDER BY created_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(jobs))
}

/// GET /sdk/jobs/{id}
pub async fn get_job(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<crate::models::job::Job>> {
    let job: crate::models::job::Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(job))
}

/// GET /sdk/jobs/{id}/stream — SSE metrics stream (reuses MetricsService)
pub async fn job_metrics_stream(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> axum::response::sse::Sse<impl futures::stream::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>
{
    use axum::response::sse::{Event, KeepAlive, Sse};
    use futures::stream::StreamExt;
    use tokio_stream::wrappers::BroadcastStream;

    let rx = state.metrics.subscribe(id).await;
    let stream = BroadcastStream::new(rx).filter_map(|result| async move {
        match result {
            Ok(event) => Some(Ok(Event::default()
                .json_data(&event)
                .unwrap_or_else(|_| Event::default().data("error")))),
            Err(_) => None,
        }
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ── Pipelines ────────────────────────────────────────────────────────

use crate::models::pipeline::*;

/// POST /sdk/pipelines
pub async fn create_pipeline(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreatePipelineRequest>,
) -> AppResult<Json<Pipeline>> {
    let pipeline_id = Uuid::new_v4();
    let project_id: Option<Uuid> = req.project_id.filter(|id| !id.is_nil());

    let pipeline: Pipeline = sqlx::query_as(
        "INSERT INTO pipelines (id, project_id, name, description, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'draft', $5, NOW(), NOW()) RETURNING *"
    )
    .bind(pipeline_id)
    .bind(project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    // Insert steps
    for (i, step) in req.steps.iter().enumerate() {
        sqlx::query(
            "INSERT INTO pipeline_steps (id, pipeline_id, step_order, step_type, config, status, created_at)
             VALUES ($1, $2, $3, $4, $5, 'pending', NOW())"
        )
        .bind(Uuid::new_v4())
        .bind(pipeline_id)
        .bind(i as i32)
        .bind(&step.step_type)
        .bind(&step.config)
        .execute(&state.db)
        .await?;
    }

    notify(&state.db, claims.sub, "Pipeline Created", &format!("Pipeline '{}' created via SDK", pipeline.name), NotifyType::Info, None).await;
    Ok(Json(pipeline))
}

#[derive(Debug, serde::Deserialize)]
pub struct SdkListPipelinesQuery {
    pub project_id: Option<Uuid>,
}

/// GET /sdk/pipelines
pub async fn list_pipelines(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(q): Query<SdkListPipelinesQuery>,
) -> AppResult<Json<Vec<Pipeline>>> {
    let pipelines: Vec<Pipeline> = if let Some(pid) = q.project_id {
        sqlx::query_as("SELECT * FROM pipelines WHERE project_id = $1 ORDER BY created_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM pipelines ORDER BY created_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(pipelines))
}

/// GET /sdk/pipelines/{id}/status
pub async fn get_pipeline_status(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let pipeline: Pipeline = sqlx::query_as("SELECT * FROM pipelines WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    let steps: Vec<PipelineStep> = sqlx::query_as(
        "SELECT * FROM pipeline_steps WHERE pipeline_id = $1 ORDER BY step_order"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "pipeline": pipeline,
        "steps": steps,
    })))
}

/// POST /sdk/pipelines/{id}/run
/// Execute a pipeline: run each step sequentially.
pub async fn run_pipeline(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // Update pipeline status
    sqlx::query("UPDATE pipelines SET status = 'running', updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    let steps: Vec<PipelineStep> = sqlx::query_as(
        "SELECT * FROM pipeline_steps WHERE pipeline_id = $1 ORDER BY step_order"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    // Spawn async task to run steps sequentially
    let db = state.db.clone();
    let k8s = state.k8s.clone();
    let pipeline_id = id;
    let user_id = claims.sub;

    tokio::spawn(async move {
        for step in &steps {
            // Mark step as running
            let _ = sqlx::query("UPDATE pipeline_steps SET status = 'running' WHERE id = $1")
                .bind(step.id)
                .execute(&db)
                .await;

            let step_config = &step.config;
            let model_id_str = step_config.get("model_id").and_then(|v| v.as_str()).unwrap_or("");
            let dataset_id_str = step_config.get("dataset_id").and_then(|v| v.as_str());
            let hp = step_config.get("hyperparameters").cloned();
            let hw = step_config.get("hardware_tier").and_then(|v| v.as_str()).unwrap_or("cpu-small");

            // Resolve model
            let model = match resolve_model_id(&db, model_id_str).await {
                Ok(m) => m,
                Err(_) => {
                    let _ = sqlx::query("UPDATE pipeline_steps SET status = 'failed' WHERE id = $1")
                        .bind(step.id).execute(&db).await;
                    let _ = sqlx::query("UPDATE pipelines SET status = 'failed', updated_at = NOW() WHERE id = $1")
                        .bind(pipeline_id).execute(&db).await;
                    return;
                }
            };

            let dataset_id = if let Some(ds) = dataset_id_str {
                resolve_dataset_id(&db, ds).await.ok()
            } else {
                None
            };

            let job_type = &step.step_type;
            let job_id = Uuid::new_v4();

            // Create job
            let _ = sqlx::query(
                "INSERT INTO jobs (id, project_id, model_id, dataset_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, NOW(), NOW())"
            )
            .bind(job_id)
            .bind(model.project_id)
            .bind(model.id)
            .bind(dataset_id)
            .bind(job_type)
            .bind(hw)
            .bind(&hp)
            .bind(user_id)
            .execute(&db)
            .await;

            // Link job to step
            let _ = sqlx::query("UPDATE pipeline_steps SET job_id = $2 WHERE id = $1")
                .bind(step.id).bind(job_id).execute(&db).await;

            // Create K8s job
            if let Some(ref k8s) = k8s {
                match k8s.create_training_job(
                    job_id, model.id, &model.framework, hw,
                    dataset_id, hp.as_ref(), job_type,
                ).await {
                    Ok(k8s_name) => {
                        let _ = sqlx::query("UPDATE jobs SET k8s_job_name = $2, status = 'running', started_at = NOW() WHERE id = $1")
                            .bind(job_id).bind(&k8s_name).execute(&db).await;
                    }
                    Err(e) => {
                        tracing::warn!("Pipeline step K8s error: {e}");
                        let _ = sqlx::query("UPDATE pipeline_steps SET status = 'failed' WHERE id = $1")
                            .bind(step.id).execute(&db).await;
                        let _ = sqlx::query("UPDATE pipelines SET status = 'failed', updated_at = NOW() WHERE id = $1")
                            .bind(pipeline_id).execute(&db).await;
                        return;
                    }
                }
            }

            // Poll job completion
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                let status: Option<String> = sqlx::query_scalar("SELECT status::text FROM jobs WHERE id = $1")
                    .bind(job_id)
                    .fetch_optional(&db)
                    .await
                    .ok()
                    .flatten();

                match status.as_deref() {
                    Some("completed") => {
                        let _ = sqlx::query("UPDATE pipeline_steps SET status = 'completed' WHERE id = $1")
                            .bind(step.id).execute(&db).await;
                        break;
                    }
                    Some("failed") | Some("cancelled") => {
                        let _ = sqlx::query("UPDATE pipeline_steps SET status = 'failed' WHERE id = $1")
                            .bind(step.id).execute(&db).await;
                        let _ = sqlx::query("UPDATE pipelines SET status = 'failed', updated_at = NOW() WHERE id = $1")
                            .bind(pipeline_id).execute(&db).await;
                        return;
                    }
                    _ => continue, // still running
                }
            }
        }

        // All steps completed
        let _ = sqlx::query("UPDATE pipelines SET status = 'completed', updated_at = NOW() WHERE id = $1")
            .bind(pipeline_id)
            .execute(&db)
            .await;
    });

    notify(&state.db, claims.sub, "Pipeline Started", "Pipeline execution has started", NotifyType::Info, None).await;
    Ok(Json(serde_json::json!({
        "pipeline_id": id,
        "status": "running",
        "message": "Pipeline execution started",
    })))
}

// ══════════════════════════════════════════════════════════════════════
// Phase 5: Hyperparameter Sweep
// ══════════════════════════════════════════════════════════════════════

use crate::models::sweep::*;

/// POST /sdk/sweeps
pub async fn create_sweep(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateSweepRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let model = resolve_model_id(&state.db, &req.model_id).await?;
    let project_id = req.project_id.or(model.project_id);

    let dataset_id = if let Some(ref ds) = req.dataset_id {
        Some(resolve_dataset_id(&state.db, ds).await?)
    } else {
        None
    };

    let strategy = req.strategy.unwrap_or_else(|| "random".into());
    let max_trials = req.max_trials.unwrap_or(10);
    let objective_metric = req.objective_metric.unwrap_or_else(|| "loss".into());
    let objective_direction = req.objective_direction.unwrap_or_else(|| "minimize".into());
    let hardware_tier = req.hardware_tier.unwrap_or_else(|| "cpu-small".into());

    // Create experiment
    let experiment_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO experiments (id, project_id, name, created_by, experiment_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'sweep', NOW(), NOW())"
    )
    .bind(experiment_id)
    .bind(project_id)
    .bind(&req.name)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    // Create sweep
    let sweep_id = Uuid::new_v4();
    let sweep: Sweep = sqlx::query_as(
        "INSERT INTO sweeps (id, experiment_id, model_id, dataset_id, search_space, strategy, max_trials, status, hardware_tier, objective_metric, objective_direction, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', $8, $9, $10, $11, NOW(), NOW()) RETURNING *"
    )
    .bind(sweep_id)
    .bind(experiment_id)
    .bind(model.id)
    .bind(dataset_id)
    .bind(&req.search_space)
    .bind(&strategy)
    .bind(max_trials)
    .bind(&hardware_tier)
    .bind(&objective_metric)
    .bind(&objective_direction)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    // Spawn async sweep execution
    let db = state.db.clone();
    let k8s = state.k8s.clone();
    let search_space = req.search_space.clone();
    let model_id = model.id;
    let framework = model.framework.clone();
    let user_id = claims.sub;
    let strategy_clone = strategy.clone();

    tokio::spawn(async move {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::from_entropy();
        let strategy = strategy_clone;
        let mut best_value: Option<f64> = None;
        let mut best_job: Option<Uuid> = None;

        for trial in 0..max_trials {
            // Sample hyperparameters
            let hp = sample_hyperparameters(&search_space, &strategy, &mut rng, trial, max_trials);

            let job_id = Uuid::new_v4();

            // Create job
            let _ = sqlx::query(
                "INSERT INTO jobs (id, project_id, model_id, dataset_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'training', 'pending', $5, $6, $7, NOW(), NOW())"
            )
            .bind(job_id)
            .bind(project_id)
            .bind(model_id)
            .bind(dataset_id)
            .bind(&hardware_tier)
            .bind(&hp)
            .bind(user_id)
            .execute(&db)
            .await;

            // Create K8s job
            if let Some(ref k8s) = k8s {
                match k8s.create_training_job(
                    job_id, model_id, &framework, &hardware_tier,
                    dataset_id, Some(&hp), "training",
                ).await {
                    Ok(k8s_name) => {
                        let _ = sqlx::query("UPDATE jobs SET k8s_job_name = $2, status = 'running', started_at = NOW() WHERE id = $1")
                            .bind(job_id).bind(&k8s_name).execute(&db).await;
                    }
                    Err(e) => {
                        tracing::warn!("Sweep trial K8s error: {e}");
                        continue;
                    }
                }
            }

            // Poll job completion
            let final_status = loop {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                let status: Option<String> = sqlx::query_scalar("SELECT status::text FROM jobs WHERE id = $1")
                    .bind(job_id)
                    .fetch_optional(&db)
                    .await
                    .ok()
                    .flatten();
                match status.as_deref() {
                    Some("completed") | Some("failed") | Some("cancelled") => break status,
                    _ => continue,
                }
            };

            // Get final metric for this trial
            if final_status.as_deref() == Some("completed") {
                let metric_val: Option<f64> = sqlx::query_scalar(
                    "SELECT value FROM training_metrics WHERE job_id = $1 AND metric_name = $2 ORDER BY recorded_at DESC LIMIT 1"
                )
                .bind(job_id)
                .bind(&objective_metric)
                .fetch_optional(&db)
                .await
                .ok()
                .flatten();

                // Record experiment run
                let metrics_json = serde_json::json!({&objective_metric: metric_val});
                let _ = sqlx::query(
                    "INSERT INTO experiment_runs (id, experiment_id, job_id, parameters, metrics, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())"
                )
                .bind(Uuid::new_v4())
                .bind(experiment_id)
                .bind(job_id)
                .bind(&hp)
                .bind(&metrics_json)
                .execute(&db)
                .await;

                // Track best
                if let Some(val) = metric_val {
                    let is_better = match (best_value, objective_direction.as_str()) {
                        (None, _) => true,
                        (Some(prev), "minimize") => val < prev,
                        (Some(prev), _) => val > prev,
                    };
                    if is_better {
                        best_value = Some(val);
                        best_job = Some(job_id);
                    }
                }
            }

            // Update sweep progress
            let _ = sqlx::query(
                "UPDATE sweeps SET completed_trials = $2, best_job_id = $3, best_metric_value = $4, updated_at = NOW() WHERE id = $1"
            )
            .bind(sweep_id)
            .bind(trial + 1)
            .bind(best_job)
            .bind(best_value)
            .execute(&db)
            .await;

            // Check if sweep was stopped
            let sweep_status: Option<String> = sqlx::query_scalar("SELECT status FROM sweeps WHERE id = $1")
                .bind(sweep_id)
                .fetch_optional(&db)
                .await
                .ok()
                .flatten();
            if sweep_status.as_deref() == Some("stopped") {
                break;
            }
        }

        // Mark sweep as completed
        let _ = sqlx::query("UPDATE sweeps SET status = 'completed', updated_at = NOW() WHERE id = $1")
            .bind(sweep_id)
            .execute(&db)
            .await;
    });

    notify(&state.db, claims.sub, "Sweep Started", &format!("Hyperparameter sweep '{}' started ({} trials)", req.name, max_trials), NotifyType::Info, None).await;
    Ok(Json(serde_json::json!({
        "sweep_id": sweep.id,
        "experiment_id": experiment_id,
        "status": "running",
        "max_trials": max_trials,
        "strategy": strategy,
    })))
}

/// Sample hyperparameters from search space
fn sample_hyperparameters(
    search_space: &serde_json::Value,
    strategy: &str,
    rng: &mut impl rand::Rng,
    trial_index: i32,
    _max_trials: i32,
) -> serde_json::Value {
    let obj = search_space.as_object().unwrap_or(&serde_json::Map::new()).clone();
    let mut result = serde_json::Map::new();

    if strategy == "grid" {
        // Grid search: deterministic indexing through combinations
        let mut divisor = 1i32;
        for (key, spec) in &obj {
            let val = match spec.get("type").and_then(|t| t.as_str()) {
                Some("choice") => {
                    let values = spec.get("values").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                    if values.is_empty() {
                        serde_json::Value::Null
                    } else {
                        let idx = ((trial_index / divisor) as usize) % values.len();
                        divisor *= values.len() as i32;
                        values[idx].clone()
                    }
                }
                Some("int_range") => {
                    let min = spec.get("min").and_then(|v| v.as_i64()).unwrap_or(0);
                    let max = spec.get("max").and_then(|v| v.as_i64()).unwrap_or(10);
                    let range = (max - min + 1) as i32;
                    let idx = ((trial_index / divisor) % range) as i64;
                    divisor *= range;
                    serde_json::json!(min + idx)
                }
                _ => sample_single_param(spec, rng),
            };
            result.insert(key.clone(), val);
        }
    } else {
        // Random search
        for (key, spec) in &obj {
            result.insert(key.clone(), sample_single_param(spec, rng));
        }
    }

    serde_json::Value::Object(result)
}

fn sample_single_param(spec: &serde_json::Value, rng: &mut impl rand::Rng) -> serde_json::Value {
    match spec.get("type").and_then(|t| t.as_str()) {
        Some("uniform") => {
            let min = spec.get("min").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let max = spec.get("max").and_then(|v| v.as_f64()).unwrap_or(1.0);
            serde_json::json!(rng.gen_range(min..max))
        }
        Some("log_uniform") => {
            let min = spec.get("min").and_then(|v| v.as_f64()).unwrap_or(1e-5);
            let max = spec.get("max").and_then(|v| v.as_f64()).unwrap_or(1e-1);
            let log_min = min.ln();
            let log_max = max.ln();
            serde_json::json!(rng.gen_range(log_min..log_max).exp())
        }
        Some("int_range") => {
            let min = spec.get("min").and_then(|v| v.as_i64()).unwrap_or(0);
            let max = spec.get("max").and_then(|v| v.as_i64()).unwrap_or(10);
            serde_json::json!(rng.gen_range(min..=max))
        }
        Some("choice") => {
            let values = spec.get("values").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            if values.is_empty() {
                serde_json::Value::Null
            } else {
                values[rng.gen_range(0..values.len())].clone()
            }
        }
        _ => serde_json::Value::Null,
    }
}

/// GET /sdk/sweeps/{id}
pub async fn get_sweep(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Sweep>> {
    let sweep: Sweep = sqlx::query_as("SELECT * FROM sweeps WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(sweep))
}

/// POST /sdk/sweeps/{id}/stop
pub async fn stop_sweep(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("UPDATE sweeps SET status = 'stopped', updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"stopped": true})))
}
