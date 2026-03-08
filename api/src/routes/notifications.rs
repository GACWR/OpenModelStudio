use axum::{
    extract::State,
    Json,
};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::notification::*;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<Vec<Notification>>> {
    let notifs: Vec<Notification> = sqlx::query_as(
        "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(notifs))
}

pub async fn unread_count(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false"
    )
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "count": row.0 })))
}

pub async fn mark_read(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<MarkReadRequest>,
) -> AppResult<Json<serde_json::Value>> {
    for id in &req.notification_ids {
        sqlx::query("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(claims.sub)
            .execute(&state.db)
            .await?;
    }
    Ok(Json(serde_json::json!({ "marked_read": req.notification_ids.len() })))
}

pub async fn mark_all_read(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        "UPDATE notifications SET read = true WHERE user_id = $1 AND read = false"
    )
    .bind(claims.sub)
    .execute(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "marked_read": result.rows_affected() })))
}
