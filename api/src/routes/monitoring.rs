use axum::{
    extract::State,
    Json,
};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::extra::InferenceEndpoint;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<InferenceEndpoint>>> {
    let endpoints: Vec<InferenceEndpoint> = sqlx::query_as(
        "SELECT * FROM inference_endpoints ORDER BY updated_at DESC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(endpoints))
}
