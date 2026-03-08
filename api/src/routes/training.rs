use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures::stream::Stream;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::models::job::*;
use crate::models::job_log::*;
use crate::services::metrics::MetricRecord;
use crate::services::notify::{notify, NotifyType};
use crate::AppState;

pub async fn start(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<StartTrainingRequest>,
) -> AppResult<Json<Job>> {
    let model: crate::models::model::Model =
        sqlx::query_as("SELECT * FROM models WHERE id = $1")
            .bind(req.model_id)
            .fetch_one(&state.db)
            .await?;

    let job_id = Uuid::new_v4();
    let hardware_tier = req.hardware_tier.unwrap_or_else(|| "cpu-small".into());

    let job: Job = sqlx::query_as(
        "INSERT INTO jobs (id, project_id, model_id, dataset_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'training', $5, $6, $7, $8, NOW(), NOW()) RETURNING *"
    )
    .bind(job_id)
    .bind(model.project_id)
    .bind(req.model_id)
    .bind(req.dataset_id)
    .bind(JobStatus::Pending)
    .bind(&hardware_tier)
    .bind(&req.hyperparameters)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    // Create K8s job (best-effort)
    if let Some(ref k8s) = state.k8s {
        match k8s
            .create_training_job(
                job_id,
                req.model_id,
                &model.framework,
                &hardware_tier,
                req.dataset_id,
                req.hyperparameters.as_ref(),
                "training",
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
                tracing::warn!("K8s job creation failed: {e}");
            }
        }
    }

    notify(&state.db, claims.sub, "Training Started", &format!("Training job started on {}", hardware_tier), NotifyType::Info, Some(&format!("/training/{}", job_id))).await;
    Ok(Json(job))
}

pub async fn list_all_jobs(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<Job>>> {
    let jobs: Vec<Job> = if let Some(pid) = params.project_id {
        sqlx::query_as("SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM jobs ORDER BY created_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(jobs))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Job>> {
    let job: Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(job))
}

/// SSE stream of real-time metrics for a training job
pub async fn metrics_stream(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.metrics.subscribe(id).await;
    let stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(event) => Some(Ok(Event::default()
            .json_data(&event)
            .unwrap_or_else(|_| Event::default().data("error")))),
        Err(_) => None,
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Get all historical metrics for a training job
pub async fn metrics_history(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<MetricRecord>>> {
    let records = crate::services::metrics::MetricsService::get_metrics_history(&state.db, id)
        .await?;
    Ok(Json(records))
}

pub async fn cancel(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Job>> {
    let job: Job = sqlx::query_as("SELECT * FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    if job.status == JobStatus::Completed || job.status == JobStatus::Failed {
        return Err(AppError::BadRequest("Job already finished".into()));
    }

    if let (Some(ref k8s), Some(ref k8s_name)) = (&state.k8s, &job.k8s_job_name) {
        let _ = k8s.delete_job(k8s_name).await;
    }

    let updated: Job = sqlx::query_as(
        "UPDATE jobs SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *"
    )
    .bind(JobStatus::Cancelled)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    state.metrics.remove(&id).await;
    notify(&state.db, claims.sub, "Job Cancelled", "Training job has been cancelled", NotifyType::Warning, Some(&format!("/training/{}", id))).await;
    Ok(Json(updated))
}

/// Internal endpoint for model-runner pods to POST metrics
pub async fn post_metrics(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
    Json(event): Json<MetricEvent>,
) -> AppResult<Json<serde_json::Value>> {
    // Update job-level fields based on metric names
    match event.metric_name.as_str() {
        "loss" => {
            sqlx::query("UPDATE jobs SET loss = $2, updated_at = NOW() WHERE id = $1")
                .bind(job_id).bind(event.value).execute(&state.db).await.ok();
        }
        "learning_rate" | "lr" => {
            sqlx::query("UPDATE jobs SET learning_rate = $2, updated_at = NOW() WHERE id = $1")
                .bind(job_id).bind(event.value).execute(&state.db).await.ok();
        }
        "progress" => {
            sqlx::query("UPDATE jobs SET progress = $2, updated_at = NOW() WHERE id = $1")
                .bind(job_id).bind(event.value as i32).execute(&state.db).await.ok();
        }
        _ => {}
    }
    // Update epoch tracking from the event's epoch field
    if let Some(epoch) = event.epoch {
        sqlx::query("UPDATE jobs SET epoch_current = $2, updated_at = NOW() WHERE id = $1")
            .bind(job_id).bind(epoch as i32).execute(&state.db).await.ok();
    }

    // Check for training completion (progress >= 100)
    if event.metric_name == "progress" && event.value >= 100.0 {
        // Mark job as completed with final timestamp
        sqlx::query(
            "UPDATE jobs SET status = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = $1 AND status != 'completed'"
        )
        .bind(job_id)
        .execute(&state.db)
        .await
        .ok();

        state.metrics.remove(&job_id).await;

        // Look up the job owner to notify them
        let owner: Option<(Uuid,)> = sqlx::query_as("SELECT created_by FROM jobs WHERE id = $1")
            .bind(job_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
        if let Some((user_id,)) = owner {
            notify(&state.db, user_id, "Training Complete", "Training job has finished successfully", NotifyType::Success, Some(&format!("/training/{}", job_id))).await;
        }
    }

    state.metrics.publish(&state.db, job_id, event).await
        .map_err(|e| AppError::Internal(format!("Failed to store metric: {e}")))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Log endpoints ──────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct LogQuery {
    pub level: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Get logs for a job
pub async fn get_logs(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
    Query(q): Query<LogQuery>,
) -> AppResult<Json<Vec<JobLog>>> {
    let limit = q.limit.unwrap_or(1000).min(5000);
    let offset = q.offset.unwrap_or(0);

    let logs: Vec<JobLog> = if let Some(ref level) = q.level {
        sqlx::query_as(
            "SELECT * FROM job_logs WHERE job_id = $1 AND level = $2 ORDER BY timestamp ASC LIMIT $3 OFFSET $4"
        )
        .bind(id).bind(level).bind(limit).bind(offset)
        .fetch_all(&state.db).await?
    } else {
        sqlx::query_as(
            "SELECT * FROM job_logs WHERE job_id = $1 ORDER BY timestamp ASC LIMIT $2 OFFSET $3"
        )
        .bind(id).bind(limit).bind(offset)
        .fetch_all(&state.db).await?
    };
    Ok(Json(logs))
}

/// Internal endpoint for model-runner pods to batch-post logs
pub async fn post_logs(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
    Json(req): Json<PostLogBatchRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let count = req.logs.len();
    for log in &req.logs {
        let ts = log.timestamp.unwrap_or_else(chrono::Utc::now);
        sqlx::query(
            "INSERT INTO job_logs (id, job_id, level, message, logger_name, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(Uuid::new_v4())
        .bind(job_id)
        .bind(&log.level)
        .bind(&log.message)
        .bind(&log.logger_name)
        .bind(ts)
        .execute(&state.db).await?;
    }
    Ok(Json(serde_json::json!({ "ok": true, "count": count })))
}
