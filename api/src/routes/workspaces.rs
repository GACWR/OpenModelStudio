use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::auth::create_workspace_token;
use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::models::workspace::*;
use crate::services::notify::{notify, NotifyType};
use crate::AppState;

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<Workspace>>> {
    let workspaces: Vec<Workspace> = if let Some(pid) = params.project_id {
        sqlx::query_as("SELECT * FROM workspaces WHERE project_id = $1 ORDER BY updated_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM workspaces ORDER BY updated_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(workspaces))
}

pub async fn launch(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<LaunchWorkspaceRequest>,
) -> AppResult<Json<WorkspaceLaunchResponse>> {
    let ws_id = Uuid::new_v4();
    let hardware_tier = req.hardware_tier.unwrap_or_else(|| "cpu-small".into());

    // Determine docker image
    let docker_image = if let Some(env_id) = req.environment_id {
        let env: Environment = sqlx::query_as("SELECT * FROM environments WHERE id = $1")
            .bind(env_id)
            .fetch_one(&state.db)
            .await?;
        env.docker_image
    } else {
        "openmodelstudio/workspace:latest".to_string()
    };

    // Generate a long-lived JWT (30 days) for the workspace pod so the SDK can call the API
    let workspace_token = create_workspace_token(
        claims.sub,
        &claims.email,
        claims.role.clone(),
        &state.config.jwt_secret,
    )
    .map_err(|e| AppError::Internal(format!("Failed to create workspace token: {e}")))?;

    let (pod_name, access_url) = if let Some(ref k8s) = state.k8s {
        // Create a persistent volume for workspace files
        let pvc_name = k8s.create_workspace_pvc(ws_id)
            .await
            .map_err(|e| AppError::Internal(format!("K8s PVC error: {e}")))?;

        k8s.create_workspace_pod(ws_id, &docker_image, &hardware_tier, req.project_id, &workspace_token, &pvc_name)
            .await
            .map_err(|e| AppError::Internal(format!("K8s error: {e}")))?
    } else {
        (format!("ws-{}", ws_id), "http://localhost:31003".to_string())
    };

    let ws: Workspace = sqlx::query_as(
        "INSERT INTO workspaces (id, project_id, name, environment_id, pod_name, status, access_url, hardware_tier, ide, cpu_usage, ram_usage, gpu_usage, duration, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, 'jupyterlab', 0, 0, 0, NULL, $8, NOW(), NOW()) RETURNING *"
    )
    .bind(ws_id)
    .bind(req.project_id)
    .bind(&req.name)
    .bind(req.environment_id)
    .bind(&pod_name)
    .bind(&access_url)
    .bind(&hardware_tier)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    notify(&state.db, claims.sub, "Workspace Launched", &format!("Workspace '{}' is now running", ws.name), NotifyType::Success, Some("/workspaces")).await;
    Ok(Json(WorkspaceLaunchResponse {
        access_url: ws.access_url.clone().unwrap_or_default(),
        workspace: ws,
    }))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Workspace>> {
    let ws: Workspace = sqlx::query_as("SELECT * FROM workspaces WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(ws))
}

pub async fn stop(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let ws: Workspace = sqlx::query_as("SELECT * FROM workspaces WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    if let (Some(ref k8s), Some(ref pod_name)) = (&state.k8s, &ws.pod_name) {
        let _ = k8s.delete_pod(pod_name).await;
        // Also clean up the PVC since this is a permanent delete
        let _ = k8s.delete_workspace_pvc(ws.id).await;
    }

    sqlx::query("DELETE FROM workspaces WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    notify(&state.db, claims.sub, "Workspace Stopped", &format!("Workspace '{}' has been stopped", ws.name), NotifyType::Info, Some("/workspaces")).await;
    Ok(Json(serde_json::json!({ "stopped": true })))
}
