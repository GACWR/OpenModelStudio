use axum::{
    extract::State,
    Json,
};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::experiment::{Experiment, ExperimentRun};
use crate::AppState;

pub async fn list_sweeps(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<Experiment>>> {
    let sweeps: Vec<Experiment> = sqlx::query_as(
        "SELECT * FROM experiments WHERE experiment_type = 'automl' ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(sweeps))
}

pub async fn list_trials(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> AppResult<Json<Vec<ExperimentRun>>> {
    let trials: Vec<ExperimentRun> = sqlx::query_as(
        "SELECT er.* FROM experiment_runs er
         JOIN experiments e ON er.experiment_id = e.id
         WHERE e.experiment_type = 'automl'
         ORDER BY er.created_at DESC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(trials))
}
