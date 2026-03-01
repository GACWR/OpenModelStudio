use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::workspace::*;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<Environment>>> {
    let envs: Vec<Environment> = sqlx::query_as(
        "SELECT * FROM environments ORDER BY name"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(envs))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Environment>> {
    let env: Environment = sqlx::query_as("SELECT * FROM environments WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(env))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateEnvironmentRequest>,
) -> AppResult<Json<Environment>> {
    let env: Environment = sqlx::query_as(
        "INSERT INTO environments (id, name, description, docker_image, gpu_enabled, packages, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.docker_image)
    .bind(req.gpu_enabled.unwrap_or(false))
    .bind(&req.packages)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(env))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<CreateEnvironmentRequest>,
) -> AppResult<Json<Environment>> {
    let env: Environment = sqlx::query_as(
        "UPDATE environments SET name = $1, description = $2, docker_image = $3, gpu_enabled = $4, packages = $5
         WHERE id = $6 RETURNING *"
    )
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.docker_image)
    .bind(req.gpu_enabled.unwrap_or(false))
    .bind(&req.packages)
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(env))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM environments WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
