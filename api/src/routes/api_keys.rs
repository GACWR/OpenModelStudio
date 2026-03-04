use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::auth::compute_api_key_hash;
use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::extra::{ApiKey, ApiKeyPublic};
use crate::AppState;

#[derive(Debug, serde::Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
}

#[derive(Debug, serde::Serialize)]
pub struct CreateApiKeyResponse {
    pub id: Uuid,
    pub name: String,
    pub key: String,
    pub prefix: String,
}

pub async fn list(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<Vec<ApiKeyPublic>>> {
    let keys: Vec<ApiKey> = sqlx::query_as(
        "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    let public_keys: Vec<ApiKeyPublic> = keys
        .into_iter()
        .map(|k| ApiKeyPublic {
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            last_used_at: k.last_used_at,
            created_at: k.created_at,
        })
        .collect();

    Ok(Json(public_keys))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateApiKeyRequest>,
) -> AppResult<Json<CreateApiKeyResponse>> {
    let id = Uuid::new_v4();
    let raw_key = format!("oms_{}", Uuid::new_v4().to_string().replace('-', ""));
    let prefix = format!("{}...", &raw_key[..12]);
    let key_hash = compute_api_key_hash(&raw_key);

    sqlx::query(
        "INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())"
    )
    .bind(id)
    .bind(claims.sub)
    .bind(&req.name)
    .bind(&key_hash)
    .bind(&prefix)
    .execute(&state.db)
    .await?;

    Ok(Json(CreateApiKeyResponse {
        id,
        name: req.name,
        key: raw_key,
        prefix,
    }))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(claims.sub)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
