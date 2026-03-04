use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use chrono::Utc;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::{compute_api_key_hash, compute_api_key_hash_legacy, validate_token, Claims};
use crate::error::AppError;
use crate::models::user::UserRole;
use crate::AppState;

/// Extracts and validates JWT or API key from Authorization header.
/// Accepts: Bearer <jwt> or Bearer oms_<uuid> (API key from Settings → API Keys).
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

#[derive(FromRow)]
struct ApiKeyUserRow {
    user_id: Uuid,
    email: String,
    role: UserRole,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing authorization header".into()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Invalid authorization format".into()))?;

        let claims = if token.starts_with("oms_") {
            // API key: look up by hash (SHA-256 first, then legacy FNV for old keys)
            let key_hash = compute_api_key_hash(token);
            let key_hash_legacy = compute_api_key_hash_legacy(token);
            let row: Option<ApiKeyUserRow> = sqlx::query_as(
                "SELECT u.id AS user_id, u.email, u.role
                 FROM api_keys ak
                 JOIN users u ON u.id = ak.user_id
                 WHERE ak.key_hash = $1 OR ak.key_hash = $2",
            )
            .bind(&key_hash)
            .bind(&key_hash_legacy)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| AppError::Unauthorized(format!("API key lookup failed: {e}")))?;

            let row = row.ok_or_else(|| AppError::Unauthorized("Invalid or revoked API key".into()))?;

            // Update last_used_at (best-effort; match whichever hash was stored)
            let _ = sqlx::query("UPDATE api_keys SET last_used_at = $1 WHERE key_hash = $2 OR key_hash = $3")
                .bind(Utc::now())
                .bind(&key_hash)
                .bind(&key_hash_legacy)
                .execute(&state.db)
                .await;

            let now = Utc::now().timestamp();
            Claims {
                sub: row.user_id,
                email: row.email,
                role: row.role,
                iat: now,
                exp: now + 365 * 24 * 3600, // API keys don't expire from our side
                token_type: "access".into(),
            }
        } else {
            // JWT
            let claims = validate_token(token, &state.config.jwt_secret)
                .map_err(|e| AppError::Unauthorized(format!("Invalid token: {e}")))?;
            if claims.token_type != "access" {
                return Err(AppError::Unauthorized("Not an access token".into()));
            }
            claims
        };

        Ok(AuthUser(claims))
    }
}

/// Role guard — checks that the user has at least the required role
pub fn check_role(user: &Claims, required: &UserRole) -> Result<(), AppError> {
    let level = role_level(&user.role);
    let required_level = role_level(required);
    if level >= required_level {
        Ok(())
    } else {
        Err(AppError::Forbidden("Insufficient permissions".into()))
    }
}

fn role_level(role: &UserRole) -> u8 {
    match role {
        UserRole::Viewer => 0,
        UserRole::Member => 1,
        UserRole::Manager => 2,
        UserRole::Admin => 3,
    }
}
