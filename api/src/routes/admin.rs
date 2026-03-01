use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::{AuthUser, check_role};
use crate::models::user::*;
use crate::AppState;

#[derive(Debug, serde::Deserialize)]
pub struct UpdateUserRequest {
    pub name: Option<String>,
    pub role: Option<String>,
    pub active: Option<bool>,
}

pub async fn list_users(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<Vec<UserPublic>>> {
    check_role(&claims, &UserRole::Admin)?;

    let users: Vec<User> = sqlx::query_as("SELECT * FROM users ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await?;

    Ok(Json(users.into_iter().map(|u| u.into()).collect()))
}

pub async fn system_stats(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    check_role(&claims, &UserRole::Admin)?;

    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;

    let project_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM projects")
        .fetch_one(&state.db)
        .await?;

    let job_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM jobs")
        .fetch_one(&state.db)
        .await?;

    let model_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM models")
        .fetch_one(&state.db)
        .await?;

    let dataset_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM datasets")
        .fetch_one(&state.db)
        .await?;

    let workspace_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM workspaces")
        .fetch_one(&state.db)
        .await?;

    Ok(Json(serde_json::json!({
        "users": user_count.0,
        "projects": project_count.0,
        "jobs": job_count.0,
        "models": model_count.0,
        "datasets": dataset_count.0,
        "workspaces": workspace_count.0,
    })))
}

pub async fn update_user(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateUserRequest>,
) -> AppResult<Json<UserPublic>> {
    check_role(&claims, &UserRole::Admin)?;

    if let Some(name) = &req.name {
        sqlx::query("UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(user.into()))
}

pub async fn delete_user(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    check_role(&claims, &UserRole::Admin)?;

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
