use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Template {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub config: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub difficulty: String,
    pub stars: i32,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct InferenceEndpoint {
    pub id: Uuid,
    pub model_id: Uuid,
    pub name: String,
    pub endpoint_url: Option<String>,
    pub status: String,
    pub replicas: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub latency_ms: Option<i32>,
    pub requests_24h: i32,
    pub error_rate: f64,
    pub cpu_usage: f64,
    pub memory_usage: f64,
    pub gpu_usage: f64,
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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub key_hash: String,
    pub prefix: String,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyPublic {
    pub id: Uuid,
    pub name: String,
    pub prefix: String,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ActivityLog {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub details: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}
