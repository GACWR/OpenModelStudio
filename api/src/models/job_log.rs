use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct JobLog {
    pub id: Uuid,
    pub job_id: Uuid,
    pub level: String,
    pub message: String,
    pub logger_name: Option<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct PostLogEntry {
    pub level: String,
    pub message: String,
    pub logger_name: Option<String>,
    pub timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct PostLogBatchRequest {
    pub logs: Vec<PostLogEntry>,
}
