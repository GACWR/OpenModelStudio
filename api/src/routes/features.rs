use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::notification::*;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Feature>>> {
    let features: Vec<Feature> = sqlx::query_as(
        "SELECT * FROM features WHERE project_id = $1 ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(features))
}

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<Feature>>> {
    let features: Vec<Feature> = sqlx::query_as(
        "SELECT * FROM features ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(features))
}

pub async fn list_groups(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<crate::models::extra::FeatureGroup>>> {
    let groups: Vec<crate::models::extra::FeatureGroup> = sqlx::query_as(
        "SELECT * FROM feature_groups ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(groups))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Feature>> {
    let feature: Feature = sqlx::query_as("SELECT * FROM features WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(feature))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateFeatureRequest>,
) -> AppResult<Json<Feature>> {
    let feature: Feature = sqlx::query_as(
        "INSERT INTO features (id, project_id, name, description, feature_type, config, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(req.project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.feature_type)
    .bind(&req.config)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(feature))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM features WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
