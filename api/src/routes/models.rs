use axum::{
    extract::{Path, Query, State},
    Json,
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::job::JobStatus;
use crate::models::model::*;
use crate::services::notify::{notify, NotifyType};
use crate::AppState;

/// GET /models/registry-status?names=iris-svm,mnist-cnn
/// Returns a map of registry_name → installed (boolean).
#[derive(Debug, serde::Deserialize)]
pub struct RegistryStatusQuery {
    pub names: String,
}

pub async fn registry_status(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(q): Query<RegistryStatusQuery>,
) -> AppResult<Json<HashMap<String, bool>>> {
    let names: Vec<&str> = q.names.split(',').filter(|s| !s.is_empty()).collect();
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT registry_name FROM models WHERE registry_name = ANY($1)"
    )
    .bind(&names)
    .fetch_all(&state.db)
    .await?;

    let installed: std::collections::HashSet<String> =
        rows.into_iter().map(|r| r.0).collect();
    let result: HashMap<String, bool> = names
        .iter()
        .map(|n| (n.to_string(), installed.contains(*n)))
        .collect();

    Ok(Json(result))
}

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Model>>> {
    let models: Vec<Model> = sqlx::query_as(
        "SELECT * FROM models WHERE project_id = $1 ORDER BY updated_at DESC"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(models))
}

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<Model>>> {
    let models: Vec<Model> = if let Some(pid) = params.project_id {
        sqlx::query_as("SELECT * FROM models WHERE project_id = $1 ORDER BY updated_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM models ORDER BY updated_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(models))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Model>> {
    let model: Model = sqlx::query_as("SELECT * FROM models WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(model))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateModelRequest>,
) -> AppResult<Json<Model>> {
    let model: Model = sqlx::query_as(
        "INSERT INTO models (id, project_id, name, description, framework, source_code, version, created_by, status, language, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, 'draft', 'Python', NOW(), NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(req.project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.framework)
    .bind(&req.source_code)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    notify(&state.db, claims.sub, "Model Created", &format!("Model '{}' created ({})", model.name, model.framework), NotifyType::Success, Some(&format!("/models/{}", model.id))).await;
    Ok(Json(model))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateModelRequest>,
) -> AppResult<Json<Model>> {
    let model: Model = sqlx::query_as(
        "UPDATE models SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            framework = COALESCE($4, framework),
            updated_at = NOW()
         WHERE id = $1 RETURNING *"
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.framework)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(model))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM models WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub async fn get_code(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<CodeResponse>> {
    let model: Model = sqlx::query_as("SELECT * FROM models WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    // Try latest model_version first, fall back to models.source_code
    let latest_code: Option<String> = sqlx::query_scalar(
        "SELECT source_code FROM model_versions WHERE model_id = $1 ORDER BY version DESC LIMIT 1"
    )
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .flatten();
    Ok(Json(CodeResponse {
        model_id: model.id,
        version: model.version,
        source_code: latest_code.or(model.source_code),
    }))
}

pub async fn update_code(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCodeRequest>,
) -> AppResult<Json<CodeResponse>> {
    // Save version history
    let current: Model = sqlx::query_as("SELECT * FROM models WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    let new_version = current.version + 1;

    sqlx::query(
        "INSERT INTO model_versions (id, model_id, version, source_code, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())"
    )
    .bind(Uuid::new_v4())
    .bind(id)
    .bind(current.version)
    .bind(&current.source_code)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    let model: Model = sqlx::query_as(
        "UPDATE models SET source_code = $2, version = $3, updated_at = NOW() WHERE id = $1 RETURNING *"
    )
    .bind(id)
    .bind(&req.source_code)
    .bind(new_version)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(CodeResponse {
        model_id: model.id,
        version: model.version,
        source_code: model.source_code,
    }))
}

pub async fn list_versions(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<crate::models::model::ModelVersion>>> {
    let versions: Vec<crate::models::model::ModelVersion> = sqlx::query_as(
        "SELECT * FROM model_versions WHERE model_id = $1 ORDER BY version DESC"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(versions))
}

pub async fn run_model(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<RunModelRequest>,
) -> AppResult<Json<crate::models::job::Job>> {
    let model: Model = sqlx::query_as("SELECT * FROM models WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    let job_id = Uuid::new_v4();
    let hardware_tier = req.hardware_tier.unwrap_or_else(|| "cpu-small".into());

    let job: crate::models::job::Job = sqlx::query_as(
        "INSERT INTO jobs (id, project_id, model_id, dataset_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING *"
    )
    .bind(job_id)
    .bind(model.project_id)
    .bind(id)
    .bind(req.dataset_id)
    .bind(&req.job_type)
    .bind(JobStatus::Pending)
    .bind(&hardware_tier)
    .bind(&req.hyperparameters)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(job))
}
