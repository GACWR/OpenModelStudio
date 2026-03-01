use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Pipeline {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub config: serde_json::Value,
    pub status: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PipelineStep {
    pub id: Uuid,
    pub pipeline_id: Uuid,
    pub step_order: i32,
    pub step_type: String,
    pub config: serde_json::Value,
    pub job_id: Option<Uuid>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePipelineRequest {
    pub name: String,
    pub description: Option<String>,
    pub project_id: Option<Uuid>,
    pub steps: Vec<CreatePipelineStepRequest>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePipelineStepRequest {
    pub step_type: String,
    pub config: serde_json::Value,
}
