use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::models::job::*;
use crate::services::notify::{notify, NotifyType};
use crate::AppState;

pub async fn run(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<RunInferenceRequest>,
) -> AppResult<Json<Job>> {
    let model: crate::models::model::Model =
        sqlx::query_as("SELECT * FROM models WHERE id = $1")
            .bind(req.model_id)
            .fetch_one(&state.db)
            .await?;

    let job_id = Uuid::new_v4();
    let hardware_tier = req.hardware_tier.unwrap_or_else(|| "cpu-small".into());

    let _job: Job = sqlx::query_as(
        "INSERT INTO jobs (id, project_id, model_id, dataset_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'inference', $5, $6, $7, $8, NOW(), NOW()) RETURNING *"
    )
    .bind(job_id)
    .bind(model.project_id)
    .bind(req.model_id)
    .bind(req.dataset_id)
    .bind(JobStatus::Pending)
    .bind(&hardware_tier)
    .bind(&req.input_data)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    // Create K8s job for inference
    if let Some(ref k8s) = state.k8s {
        match k8s
            .create_training_job(
                job_id,
                req.model_id,
                &model.framework,
                &hardware_tier,
                req.dataset_id,
                req.input_data.as_ref(),
                "inference",
            )
            .await
        {
            Ok(k8s_name) => {
                sqlx::query("UPDATE jobs SET k8s_job_name = $1, status = $2, started_at = NOW(), updated_at = NOW() WHERE id = $3")
                    .bind(&k8s_name)
                    .bind(JobStatus::Running)
                    .bind(job_id)
                    .execute(&state.db)
                    .await?;
            }
            Err(e) => {
                tracing::warn!("K8s inference job creation failed: {e}");
            }
        }
    }

    // Re-fetch to get updated status
    let job: Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1")
        .bind(job_id)
        .fetch_one(&state.db)
        .await?;

    notify(&state.db, claims.sub, "Inference Started", "Inference job started for model", NotifyType::Info, Some(&format!("/inference/{}", job_id))).await;
    Ok(Json(job))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Job>> {
    let job: Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1 AND job_type = 'inference'")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(job))
}

pub async fn get_output(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let job: Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1 AND job_type = 'inference'")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(serde_json::json!({
        "job_id": job.id,
        "status": job.status,
        "metrics": job.metrics,
    })))
}
