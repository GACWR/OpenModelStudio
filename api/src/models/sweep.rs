use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Sweep {
    pub id: Uuid,
    pub experiment_id: Uuid,
    pub model_id: Uuid,
    pub dataset_id: Option<Uuid>,
    pub search_space: serde_json::Value,
    pub strategy: String,
    pub max_trials: i32,
    pub completed_trials: i32,
    pub status: String,
    pub hardware_tier: String,
    pub best_job_id: Option<Uuid>,
    pub best_metric_value: Option<f64>,
    pub objective_metric: String,
    pub objective_direction: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSweepRequest {
    pub name: String,
    pub model_id: String,
    pub dataset_id: Option<String>,
    pub search_space: serde_json::Value,
    pub strategy: Option<String>,
    pub max_trials: Option<i32>,
    pub objective_metric: Option<String>,
    pub objective_direction: Option<String>,
    pub hardware_tier: Option<String>,
    pub project_id: Option<Uuid>,
}
