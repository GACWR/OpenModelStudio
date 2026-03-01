use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct HyperparameterSet {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub parameters: serde_json::Value,
    pub model_id: Option<Uuid>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateHpSetRequest {
    pub name: String,
    pub parameters: serde_json::Value,
    pub project_id: Option<Uuid>,
    pub model_id: Option<Uuid>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateHpSetRequest {
    pub parameters: Option<serde_json::Value>,
    pub description: Option<String>,
}
