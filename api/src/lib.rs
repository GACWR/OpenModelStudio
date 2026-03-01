pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;

use sqlx::PgPool;
use std::sync::Arc;

use config::Config;
use services::k8s::K8sService;
use services::llm::LlmService;
use services::metrics::MetricsService;
use services::s3::S3Service;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub s3: Arc<S3Service>,
    pub k8s: Option<Arc<K8sService>>,
    pub metrics: MetricsService,
    pub llm: Arc<LlmService>,
}
