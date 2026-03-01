use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, sqlx::Type)]
#[sqlx(type_name = "job_status", rename_all = "lowercase")]
pub enum JobStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "queued")]
    Queued,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "cancelled")]
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Job {
    pub id: Uuid,
    pub project_id: Uuid,
    pub model_id: Uuid,
    pub dataset_id: Option<Uuid>,
    pub job_type: String,
    pub status: JobStatus,
    pub k8s_job_name: Option<String>,
    pub hardware_tier: String,
    pub hyperparameters: Option<serde_json::Value>,
    pub metrics: Option<serde_json::Value>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub progress: i32,
    pub epoch_current: Option<i32>,
    pub epoch_total: Option<i32>,
    pub loss: Option<f64>,
    pub learning_rate: Option<f64>,
    pub gpu_config: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StartTrainingRequest {
    pub model_id: Uuid,
    pub dataset_id: Option<Uuid>,
    pub hardware_tier: Option<String>,
    pub hyperparameters: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct RunInferenceRequest {
    pub model_id: Uuid,
    pub dataset_id: Option<Uuid>,
    pub input_data: Option<serde_json::Value>,
    pub hardware_tier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricEvent {
    pub metric_name: String,
    pub value: f64,
    pub step: Option<i64>,
    pub epoch: Option<i64>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}
