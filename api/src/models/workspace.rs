use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Workspace {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub environment_id: Option<Uuid>,
    pub pod_name: Option<String>,
    pub status: String,
    pub access_url: Option<String>,
    pub hardware_tier: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub ide: String,
    pub cpu_usage: f64,
    pub ram_usage: f64,
    pub gpu_usage: f64,
    pub duration: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LaunchWorkspaceRequest {
    pub project_id: Uuid,
    pub name: String,
    pub environment_id: Option<Uuid>,
    pub hardware_tier: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceLaunchResponse {
    pub workspace: Workspace,
    pub access_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Environment {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub docker_image: String,
    pub gpu_enabled: bool,
    pub packages: Option<serde_json::Value>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub cpu_limit: Option<String>,
    pub ram_limit: Option<String>,
    pub gpu_limit: Option<String>,
    pub clusters: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEnvironmentRequest {
    pub name: String,
    pub description: Option<String>,
    pub docker_image: String,
    pub gpu_enabled: Option<bool>,
    pub packages: Option<serde_json::Value>,
}
