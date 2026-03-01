use axum::{extract::State, Json};
use uuid::Uuid;

use crate::auth::{create_access_token, create_refresh_token, hash_password, validate_token, verify_password};
use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::models::user::*;
use crate::AppState;

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> AppResult<Json<AuthResponse>> {
    // Check if email already exists
    let existing: Option<User> = sqlx::query_as(
        "SELECT * FROM users WHERE email = $1"
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let password_hash = hash_password(&req.password)
        .map_err(|e| AppError::Internal(format!("Password hashing failed: {e}")))?;

    let user: User = sqlx::query_as(
        "INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(&req.email)
    .bind(&password_hash)
    .bind(&req.name)
    .bind(UserRole::Member)
    .fetch_one(&state.db)
    .await?;

    let access_token = create_access_token(user.id, &user.email, user.role.clone(), &state.config.jwt_secret)?;
    let refresh_token = create_refresh_token(user.id, &user.email, user.role.clone(), &state.config.jwt_refresh_secret)?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        user: user.into(),
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    let user: User = sqlx::query_as("SELECT * FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid email or password".into()))?;

    let valid = verify_password(&req.password, &user.password_hash)
        .map_err(|e| AppError::Internal(format!("Password verification failed: {e}")))?;

    if !valid {
        return Err(AppError::Unauthorized("Invalid email or password".into()));
    }

    let access_token = create_access_token(user.id, &user.email, user.role.clone(), &state.config.jwt_secret)?;
    let refresh_token = create_refresh_token(user.id, &user.email, user.role.clone(), &state.config.jwt_refresh_secret)?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        user: user.into(),
    }))
}

pub async fn me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<UserPublic>> {
    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(user.into()))
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub email: Option<String>,
}

pub async fn update_profile(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpdateProfileRequest>,
) -> AppResult<Json<UserPublic>> {
    if let Some(name) = &req.name {
        sqlx::query("UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name)
            .bind(claims.sub)
            .execute(&state.db)
            .await?;
    }
    if let Some(email) = &req.email {
        sqlx::query("UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2")
            .bind(email)
            .bind(claims.sub)
            .execute(&state.db)
            .await?;
    }
    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(user.into()))
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let claims = validate_token(&req.refresh_token, &state.config.jwt_refresh_secret)
        .map_err(|e| AppError::Unauthorized(format!("Invalid refresh token: {e}")))?;

    if claims.token_type != "refresh" {
        return Err(AppError::Unauthorized("Not a refresh token".into()));
    }

    let access_token = create_access_token(claims.sub, &claims.email, claims.role.clone(), &state.config.jwt_secret)?;
    let refresh_token = create_refresh_token(claims.sub, &claims.email, claims.role, &state.config.jwt_refresh_secret)?;

    Ok(Json(serde_json::json!({
        "access_token": access_token,
        "refresh_token": refresh_token,
    })))
}
