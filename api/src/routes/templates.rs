use axum::{
    extract::State,
    Json,
};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::extra::Template;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<Template>>> {
    let templates: Vec<Template> = sqlx::query_as(
        "SELECT * FROM templates ORDER BY stars DESC, name"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(templates))
}
