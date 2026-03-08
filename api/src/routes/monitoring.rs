use axum::{
    extract::{Query, State},
    Json,
};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::extra::InferenceEndpoint;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<InferenceEndpoint>>> {
    let endpoints: Vec<InferenceEndpoint> = if let Some(pid) = params.project_id {
        sqlx::query_as(
            "SELECT ie.* FROM inference_endpoints ie
             JOIN models m ON ie.model_id = m.id
             WHERE m.project_id = $1
             ORDER BY ie.updated_at DESC"
        )
        .bind(pid)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT * FROM inference_endpoints ORDER BY updated_at DESC"
        )
        .fetch_all(&state.db)
        .await?
    };
    Ok(Json(endpoints))
}
