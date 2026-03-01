use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::project::Project;
use crate::models::model::Model;
use crate::models::dataset::Dataset;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub limit: Option<i64>,
}

#[derive(Debug, serde::Serialize)]
pub struct SearchResults {
    pub projects: Vec<Project>,
    pub models: Vec<Model>,
    pub datasets: Vec<Dataset>,
}

pub async fn search(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<SearchResults>> {
    let limit = query.limit.unwrap_or(20);
    let pattern = format!("%{}%", query.q);

    let projects: Vec<Project> = sqlx::query_as(
        "SELECT * FROM projects WHERE name ILIKE $1 OR description ILIKE $1 LIMIT $2"
    )
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let models: Vec<Model> = sqlx::query_as(
        "SELECT * FROM models WHERE name ILIKE $1 OR description ILIKE $1 LIMIT $2"
    )
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let datasets: Vec<Dataset> = sqlx::query_as(
        "SELECT * FROM datasets WHERE name ILIKE $1 OR description ILIKE $1 LIMIT $2"
    )
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(SearchResults {
        projects,
        models,
        datasets,
    }))
}
