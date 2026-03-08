use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::project::*;
use crate::services::notify::{notify, NotifyType};
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<Vec<Project>>> {
    let projects: Vec<Project> = sqlx::query_as(
        "SELECT * FROM projects WHERE owner_id = $1 OR id IN (SELECT project_id FROM project_collaborators WHERE user_id = $1) ORDER BY updated_at DESC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(projects))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Project>> {
    let project: Project = sqlx::query_as("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(project))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateProjectRequest>,
) -> AppResult<Json<Project>> {
    let tags = req.tags.map(|t| serde_json::json!(t));
    let visibility = req.visibility.unwrap_or_else(|| "private".into());
    let project: Project = sqlx::query_as(
        "INSERT INTO projects (id, name, description, owner_id, tags, visibility, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(&req.name)
    .bind(&req.description)
    .bind(claims.sub)
    .bind(&tags)
    .bind(&visibility)
    .fetch_one(&state.db)
    .await?;
    notify(&state.db, claims.sub, "Project Created", &format!("Project '{}' has been created", project.name), NotifyType::Success, Some(&format!("/projects/{}", project.id))).await;
    Ok(Json(project))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProjectRequest>,
) -> AppResult<Json<Project>> {
    let project: Project = sqlx::query_as(
        "UPDATE projects SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            visibility = COALESCE($4, visibility),
            updated_at = NOW()
         WHERE id = $1 RETURNING *"
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.visibility)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(project))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub async fn add_collaborator(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
    Json(req): Json<AddCollaboratorRequest>,
) -> AppResult<Json<ProjectCollaborator>> {
    let collab: ProjectCollaborator = sqlx::query_as(
        "INSERT INTO project_collaborators (id, project_id, user_id, role, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(project_id)
    .bind(req.user_id)
    .bind(&req.role)
    .fetch_one(&state.db)
    .await?;
    notify(&state.db, req.user_id, "Added to Project", &format!("You've been added as {} to a project", req.role), NotifyType::Info, Some(&format!("/projects/{}", project_id))).await;
    Ok(Json(collab))
}

pub async fn list_collaborators(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<ProjectCollaborator>>> {
    let collabs: Vec<ProjectCollaborator> = sqlx::query_as(
        "SELECT * FROM project_collaborators WHERE project_id = $1"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(collabs))
}

pub async fn activity(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<ActivityEntry>>> {
    let entries: Vec<ActivityEntry> = sqlx::query_as(
        "SELECT * FROM activity_log WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(entries))
}
