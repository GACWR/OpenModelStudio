use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Dataset {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub format: String,
    pub s3_key: Option<String>,
    pub size_bytes: Option<i64>,
    pub row_count: Option<i64>,
    pub version: i32,
    pub created_by: Uuid,
    pub snapshots: i32,
    pub schema: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDatasetRequest {
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub format: String,
    pub data: Option<String>,       // base64-encoded file content
    pub row_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDatasetRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UploadUrlResponse {
    pub upload_url: String,
    pub s3_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DataSource {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub source_type: String,
    pub connection_string: Option<String>,
    pub config: Option<serde_json::Value>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDataSourceRequest {
    pub project_id: Uuid,
    pub name: String,
    pub source_type: String,
    pub connection_string: Option<String>,
    pub config: Option<serde_json::Value>,
}
