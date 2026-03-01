use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Experiment {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub experiment_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ExperimentRun {
    pub id: Uuid,
    pub experiment_id: Uuid,
    pub job_id: Uuid,
    pub parameters: Option<serde_json::Value>,
    pub metrics: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateExperimentRequest {
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddRunRequest {
    pub job_id: Uuid,
    pub parameters: Option<serde_json::Value>,
    pub metrics: Option<serde_json::Value>,
}
