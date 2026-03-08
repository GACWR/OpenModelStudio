use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::experiment::*;
use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Experiment>>> {
    let experiments: Vec<Experiment> = sqlx::query_as(
        "SELECT * FROM experiments WHERE project_id = $1 ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(experiments))
}

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<Experiment>>> {
    let experiments: Vec<Experiment> = if let Some(pid) = params.project_id {
        sqlx::query_as("SELECT * FROM experiments WHERE project_id = $1 ORDER BY created_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM experiments ORDER BY created_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(experiments))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Experiment>> {
    let exp: Experiment = sqlx::query_as("SELECT * FROM experiments WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(exp))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateExperimentRequest>,
) -> AppResult<Json<Experiment>> {
    let exp: Experiment = sqlx::query_as(
        "INSERT INTO experiments (id, project_id, name, description, created_by, experiment_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'manual', NOW(), NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(req.project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(exp))
}

pub async fn add_run(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(experiment_id): Path<Uuid>,
    Json(req): Json<AddRunRequest>,
) -> AppResult<Json<ExperimentRun>> {
    let run: ExperimentRun = sqlx::query_as(
        "INSERT INTO experiment_runs (id, experiment_id, job_id, parameters, metrics, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(experiment_id)
    .bind(req.job_id)
    .bind(&req.parameters)
    .bind(&req.metrics)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(run))
}

pub async fn list_runs(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(experiment_id): Path<Uuid>,
) -> AppResult<Json<Vec<ExperimentRun>>> {
    let runs: Vec<ExperimentRun> = sqlx::query_as(
        "SELECT * FROM experiment_runs WHERE experiment_id = $1 ORDER BY created_at DESC"
    )
    .bind(experiment_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(runs))
}

pub async fn compare(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(experiment_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let runs: Vec<ExperimentRun> = sqlx::query_as(
        "SELECT * FROM experiment_runs WHERE experiment_id = $1 ORDER BY created_at"
    )
    .bind(experiment_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(serde_json::json!({
        "experiment_id": experiment_id,
        "runs": runs,
        "comparison": "side-by-side metrics comparison"
    })))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM experiments WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
