use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::models::dataset::*;
use crate::AppState;

const DATASETS_DIR: &str = "/data/datasets";

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Dataset>>> {
    let datasets: Vec<Dataset> = sqlx::query_as(
        "SELECT * FROM datasets WHERE project_id = $1 ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(datasets))
}

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<Dataset>>> {
    let datasets: Vec<Dataset> = if let Some(pid) = params.project_id {
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

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Dataset>> {
    let dataset: Dataset = sqlx::query_as("SELECT * FROM datasets WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(dataset))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateDatasetRequest>,
) -> AppResult<Json<Dataset>> {
    let dataset_id = Uuid::new_v4();

    // If file data is provided (base64), store it to local PVC
    let (s3_key, size_bytes) = if let Some(ref data_b64) = req.data {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_b64)
            .map_err(|e| AppError::BadRequest(format!("Invalid base64: {e}")))?;

        let size = bytes.len() as i64;
        let dir = format!("{}/{}", DATASETS_DIR, dataset_id);
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::Internal(format!("Failed to create dir: {e}")))?;

        let ext = req.format.to_lowercase();
        let file_path = format!("{}/{}.{}", dir, req.name, ext);
        std::fs::write(&file_path, &bytes)
            .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;

        (Some(format!("local:{}", file_path)), Some(size))
    } else {
        (None, None)
    };

    let dataset: Dataset = sqlx::query_as(
        "INSERT INTO datasets (id, project_id, name, description, format, s3_key, size_bytes, row_count, version, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, NOW(), NOW()) RETURNING *"
    )
    .bind(dataset_id)
    .bind(req.project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.format)
    .bind(&s3_key)
    .bind(size_bytes)
    .bind(req.row_count)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(dataset))
}

pub async fn upload_url(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<UploadUrlResponse>> {
    let s3_key = format!("datasets/{}/{}", id, uuid::Uuid::new_v4());
    let upload_url = state
        .s3
        .presign_upload(&s3_key, "application/octet-stream", 3600)
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("S3 error: {e}")))?;

    // Update dataset with s3_key
    sqlx::query("UPDATE datasets SET s3_key = $1, updated_at = NOW() WHERE id = $2")
        .bind(&s3_key)
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(UploadUrlResponse { upload_url, s3_key }))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM datasets WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
