use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Model {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub framework: String,
    pub source_code: Option<String>,
    pub version: i32,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub status: String,
    pub language: String,
    pub origin_workspace_id: Option<Uuid>,
    pub registry_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateModelRequest {
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub framework: String,
    pub source_code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateModelRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub framework: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCodeRequest {
    pub source_code: String,
}

#[derive(Debug, Serialize)]
pub struct CodeResponse {
    pub model_id: Uuid,
    pub version: i32,
    pub source_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ModelVersion {
    pub id: Uuid,
    pub model_id: Uuid,
    pub version: i32,
    pub source_code: Option<String>,
    pub created_by: Uuid,
    pub workspace_id: Option<Uuid>,
    pub change_summary: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct RunModelRequest {
    pub dataset_id: Option<Uuid>,
    pub job_type: String,
    pub hardware_tier: Option<String>,
    pub hyperparameters: Option<serde_json::Value>,
}
