use axum::{
    extract::{Query, State},
    Json,
};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::experiment::{Experiment, ExperimentRun};
use crate::AppState;

pub async fn list_sweeps(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<Experiment>>> {
    let sweeps: Vec<Experiment> = if let Some(pid) = params.project_id {
        sqlx::query_as(
            "SELECT * FROM experiments WHERE experiment_type = 'automl' AND project_id = $1 ORDER BY created_at DESC"
        )
        .bind(pid)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT * FROM experiments WHERE experiment_type = 'automl' ORDER BY created_at DESC"
        )
        .fetch_all(&state.db)
        .await?
    };
    Ok(Json(sweeps))
}

pub async fn list_trials(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<ExperimentRun>>> {
    let trials: Vec<ExperimentRun> = if let Some(pid) = params.project_id {
        sqlx::query_as(
            "SELECT er.* FROM experiment_runs er
             JOIN experiments e ON er.experiment_id = e.id
             WHERE e.experiment_type = 'automl' AND e.project_id = $1
             ORDER BY er.created_at DESC"
        )
        .bind(pid)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT er.* FROM experiment_runs er
             JOIN experiments e ON er.experiment_id = e.id
             WHERE e.experiment_type = 'automl'
             ORDER BY er.created_at DESC"
        )
        .fetch_all(&state.db)
        .await?
    };
    Ok(Json(trials))
}
