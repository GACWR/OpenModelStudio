use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::dataset::*;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<DataSource>>> {
    let sources: Vec<DataSource> = sqlx::query_as(
        "SELECT * FROM data_sources WHERE project_id = $1 ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(sources))
}

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<DataSource>>> {
    let sources: Vec<DataSource> = sqlx::query_as(
        "SELECT * FROM data_sources ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(sources))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateDataSourceRequest>,
) -> AppResult<Json<DataSource>> {
    let source: DataSource = sqlx::query_as(
        "INSERT INTO data_sources (id, project_id, name, source_type, connection_string, config, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(req.project_id)
    .bind(&req.name)
    .bind(&req.source_type)
    .bind(&req.connection_string)
    .bind(&req.config)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(source))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM data_sources WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub async fn test_connection(
    State(_state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // In production, would actually test the connection
    Ok(Json(serde_json::json!({
        "id": id,
        "status": "ok",
        "message": "Connection test not yet implemented"
    })))
}
