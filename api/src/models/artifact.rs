use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Artifact {
    pub id: Uuid,
    pub job_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
    pub name: String,
    pub artifact_type: String,
    pub s3_key: String,
    pub size_bytes: Option<i64>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateArtifactRequest {
    pub job_id: Uuid,
    pub name: String,
    pub artifact_type: String,
}

#[derive(Debug, Serialize)]
pub struct ArtifactDownloadResponse {
    pub download_url: String,
}
