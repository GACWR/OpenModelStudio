use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::artifact::*;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(job_id): Path<Uuid>,
) -> AppResult<Json<Vec<Artifact>>> {
    let artifacts: Vec<Artifact> = sqlx::query_as(
        "SELECT * FROM artifacts WHERE job_id = $1 ORDER BY created_at DESC"
    )
    .bind(job_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(artifacts))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Artifact>> {
    let artifact: Artifact = sqlx::query_as("SELECT * FROM artifacts WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(artifact))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Json(req): Json<CreateArtifactRequest>,
) -> AppResult<Json<Artifact>> {
    let s3_key = format!("artifacts/{}/{}", req.job_id, Uuid::new_v4());
    let artifact: Artifact = sqlx::query_as(
        "INSERT INTO artifacts (id, job_id, name, artifact_type, s3_key, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(req.job_id)
    .bind(&req.name)
    .bind(&req.artifact_type)
    .bind(&s3_key)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(artifact))
}

/// List all artifacts for a model (via its jobs)
pub async fn list_for_model(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(model_id): Path<Uuid>,
) -> AppResult<Json<Vec<Artifact>>> {
    let artifacts: Vec<Artifact> = sqlx::query_as(
        "SELECT a.* FROM artifacts a
         JOIN jobs j ON a.job_id = j.id
         WHERE j.model_id = $1
         ORDER BY a.created_at DESC"
    )
    .bind(model_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(artifacts))
}

pub async fn download(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ArtifactDownloadResponse>> {
    let artifact: Artifact = sqlx::query_as("SELECT * FROM artifacts WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    let download_url = state
        .s3
        .presign_download(&artifact.s3_key, 3600)
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("S3 error: {e}")))?;

    Ok(Json(ArtifactDownloadResponse { download_url }))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM artifacts WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
