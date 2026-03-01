use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Notification {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub message: String,
    pub notification_type: String,
    pub read: bool,
    pub link: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct MarkReadRequest {
    pub notification_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Feature {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub feature_type: String,
    pub config: Option<serde_json::Value>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub group_id: Option<Uuid>,
    pub dtype: Option<String>,
    pub entity: Option<String>,
    pub null_rate: Option<f64>,
    pub mean: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFeatureRequest {
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub feature_type: String,
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct FeatureGroup {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub entity: String,
    pub description: Option<String>,
    pub serving_status: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
