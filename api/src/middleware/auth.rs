use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::auth::{validate_token, Claims};
use crate::error::AppError;
use crate::models::user::UserRole;
use crate::AppState;

/// Extracts and validates JWT from Authorization header
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

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

        let claims = validate_token(token, &state.config.jwt_secret)
            .map_err(|e| AppError::Unauthorized(format!("Invalid token: {e}")))?;

        if claims.token_type != "access" {
            return Err(AppError::Unauthorized("Not an access token".into()));
        }

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
