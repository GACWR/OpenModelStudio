use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use openmodelstudio_api::config::Config;
use openmodelstudio_api::routes;
use openmodelstudio_api::services::k8s::K8sService;
use openmodelstudio_api::services::llm::LlmService;
use openmodelstudio_api::services::metrics::MetricsService;
use openmodelstudio_api::services::s3::S3Service;
use openmodelstudio_api::AppState;

#[tokio::main]
async fn main() {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "openmodelstudio_api=debug,tower_http=debug".into()),
        )
        .init();

    let config = Config::from_env();

    let db = openmodelstudio_api::db::create_pool(&config.database_url)
        .await
        .expect("Failed to connect to database");

    let s3 = Arc::new(S3Service::new(&config).await);
    let metrics = MetricsService::new();
    let llm = Arc::new(LlmService::new(&config));

    let k8s = match K8sService::new(&config).await {
        Ok(svc) => Some(Arc::new(svc)),
        Err(e) => {
            tracing::warn!("K8s client not available: {e}. Running without K8s integration.");
            None
        }
    };

    let state = AppState {
        db,
        config: config.clone(),
        s3,
        k8s,
        metrics,
        llm,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Health
        .route("/healthz", get(routes::healthz::healthz))
        // Auth
        .route("/auth/register", post(routes::auth::register))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/me", get(routes::auth::me))
        .route("/auth/me", put(routes::auth::update_profile))
        .route("/auth/refresh", post(routes::auth::refresh))
        // Projects
        .route("/projects", get(routes::projects::list))
        .route("/projects", post(routes::projects::create))
        .route("/projects/{id}", get(routes::projects::get))
        .route("/projects/{id}", put(routes::projects::update))
        .route("/projects/{id}", delete(routes::projects::delete))
        .route("/projects/{id}/collaborators", get(routes::projects::list_collaborators))
        .route("/projects/{id}/collaborators", post(routes::projects::add_collaborator))
        .route("/projects/{id}/activity", get(routes::projects::activity))
        // Datasets
        .route("/projects/{project_id}/datasets", get(routes::datasets::list))
        .route("/datasets", get(routes::datasets::list_all))
        .route("/datasets", post(routes::datasets::create))
        .route("/datasets/{id}", get(routes::datasets::get))
        .route("/datasets/{id}", delete(routes::datasets::delete))
        .route("/datasets/{id}/upload-url", post(routes::datasets::upload_url))
        // Data Sources
        .route("/projects/{project_id}/data-sources", get(routes::data_sources::list))
        .route("/data-sources", get(routes::data_sources::list_all))
        .route("/data-sources", post(routes::data_sources::create))
        .route("/data-sources/{id}", delete(routes::data_sources::delete))
        .route("/data-sources/{id}/test", post(routes::data_sources::test_connection))
        // Models
        .route("/projects/{project_id}/models", get(routes::models::list))
        .route("/models", get(routes::models::list_all))
        .route("/models", post(routes::models::create))
        .route("/models/{id}", get(routes::models::get))
        .route("/models/{id}", put(routes::models::update))
        .route("/models/{id}", delete(routes::models::delete))
        .route("/models/{id}/code", get(routes::models::get_code))
        .route("/models/{id}/code", put(routes::models::update_code))
        .route("/models/{id}/run", post(routes::models::run_model))
        .route("/models/{id}/versions", get(routes::models::list_versions))
        // Training
        .route("/training/jobs", get(routes::training::list_all_jobs))
        .route("/training/start", post(routes::training::start))
        .route("/training/{id}", get(routes::training::get))
        .route("/training/{id}/metrics", get(routes::training::metrics_history))
        .route("/training/{id}/metrics/stream", get(routes::training::metrics_stream))
        .route("/training/{id}/cancel", post(routes::training::cancel))
        .route("/internal/metrics/{job_id}", post(routes::training::post_metrics))
        .route("/training/{id}/logs", get(routes::training::get_logs))
        .route("/internal/logs/{job_id}", post(routes::training::post_logs))
        // Inference
        .route("/inference/run", post(routes::inference::run))
        .route("/inference/{id}", get(routes::inference::get))
        .route("/inference/{id}/output", get(routes::inference::get_output))
        // Experiments
        .route("/projects/{project_id}/experiments", get(routes::experiments::list))
        .route("/experiments", get(routes::experiments::list_all))
        .route("/experiments", post(routes::experiments::create))
        .route("/experiments/{id}", get(routes::experiments::get))
        .route("/experiments/{id}", delete(routes::experiments::delete))
        .route("/experiments/{id}/runs", get(routes::experiments::list_runs))
        .route("/experiments/{id}/runs", post(routes::experiments::add_run))
        .route("/experiments/{id}/compare", get(routes::experiments::compare))
        // Artifacts
        .route("/jobs/{job_id}/artifacts", get(routes::artifacts::list))
        .route("/artifacts", post(routes::artifacts::create))
        .route("/artifacts/{id}", get(routes::artifacts::get))
        .route("/artifacts/{id}", delete(routes::artifacts::delete))
        .route("/artifacts/{id}/download", get(routes::artifacts::download))
        // Workspaces
        .route("/workspaces", get(routes::workspaces::list_all))
        .route("/workspaces/launch", post(routes::workspaces::launch))
        .route("/workspaces/{id}", get(routes::workspaces::get))
        .route("/workspaces/{id}", delete(routes::workspaces::stop))
        // Environments
        .route("/environments", get(routes::environments::list))
        .route("/environments", post(routes::environments::create))
        .route("/environments/{id}", get(routes::environments::get))
        .route("/environments/{id}", put(routes::environments::update))
        .route("/environments/{id}", delete(routes::environments::delete))
        // Features
        .route("/projects/{project_id}/features", get(routes::features::list))
        .route("/features", get(routes::features::list_all))
        .route("/features", post(routes::features::create))
        .route("/features/groups", get(routes::features::list_groups))
        .route("/features/{id}", get(routes::features::get))
        .route("/features/{id}", delete(routes::features::delete))
        // Notifications
        .route("/notifications", get(routes::notifications::list))
        .route("/notifications/read", post(routes::notifications::mark_read))
        // Search
        .route("/search", get(routes::search::search))
        // LLM
        .route("/llm/chat", post(routes::llm::chat))
        .route("/llm/conversations", get(routes::llm::conversations))
        // Templates
        .route("/templates", get(routes::templates::list))
        // Monitoring
        .route("/monitoring/models", get(routes::monitoring::list))
        // AutoML
        .route("/automl/sweeps", get(routes::automl::list_sweeps))
        .route("/automl/trials", get(routes::automl::list_trials))
        // API Keys
        .route("/api-keys", get(routes::api_keys::list))
        .route("/api-keys", post(routes::api_keys::create))
        .route("/api-keys/{id}", delete(routes::api_keys::delete))
        // SDK (workspace model registration + data access)
        .route("/sdk/register-model", post(routes::sdk::register_model))
        .route("/sdk/publish-version", post(routes::sdk::publish_version))
        .route("/sdk/create-dataset", post(routes::sdk::create_dataset))
        .route("/sdk/datasets", get(routes::sdk::list_datasets))
        .route("/sdk/datasets/{id}/download-url", get(routes::sdk::dataset_download_url))
        .route("/sdk/datasets/{id}/upload", post(routes::sdk::dataset_upload))
        .route("/sdk/datasets/{id}/content", get(routes::sdk::dataset_content))
        .route("/sdk/models/resolve/{name_or_id}", get(routes::sdk::resolve_model))
        .route("/sdk/models/{id}/artifact", get(routes::sdk::model_artifact))
        // SDK Feature Store
        .route("/sdk/features", post(routes::sdk::create_features))
        .route("/sdk/features/group/{name_or_id}", get(routes::sdk::load_feature_group))
        // SDK Hyperparameter Store
        .route("/sdk/hyperparameters", post(routes::sdk::create_hyperparameters))
        .route("/sdk/hyperparameters", get(routes::sdk::list_hyperparameters))
        .route("/sdk/hyperparameters/{name_or_id}", get(routes::sdk::get_hyperparameters).put(routes::sdk::update_hyperparameters).delete(routes::sdk::delete_hyperparameters))
        // SDK Job Kickoff
        .route("/sdk/start-training", post(routes::sdk::start_training))
        .route("/sdk/start-inference", post(routes::sdk::start_inference))
        .route("/sdk/jobs", get(routes::sdk::list_jobs))
        .route("/sdk/jobs/{id}", get(routes::sdk::get_job))
        .route("/sdk/jobs/{id}/stream", get(routes::sdk::job_metrics_stream))
        // SDK Pipelines
        .route("/sdk/pipelines", post(routes::sdk::create_pipeline))
        .route("/sdk/pipelines", get(routes::sdk::list_pipelines))
        .route("/sdk/pipelines/{id}/status", get(routes::sdk::get_pipeline_status))
        .route("/sdk/pipelines/{id}/run", post(routes::sdk::run_pipeline))
        // SDK Sweeps
        .route("/sdk/sweeps", post(routes::sdk::create_sweep))
        .route("/sdk/sweeps/{id}", get(routes::sdk::get_sweep))
        .route("/sdk/sweeps/{id}/stop", post(routes::sdk::stop_sweep))
        // SDK Visualizations
        .route("/sdk/visualizations", get(routes::visualizations::list_all))
        .route("/sdk/visualizations", post(routes::visualizations::create))
        .route("/sdk/visualizations/{id}", get(routes::visualizations::get))
        .route("/sdk/visualizations/{id}/publish", post(routes::visualizations::publish))
        .route("/sdk/visualizations/{id}/render", post(routes::visualizations::get))
        // SDK Dashboards
        .route("/sdk/dashboards", get(routes::visualizations::list_dashboards))
        .route("/sdk/dashboards", post(routes::visualizations::create_dashboard))
        .route("/sdk/dashboards/{id}", get(routes::visualizations::get_dashboard))
        .route("/sdk/dashboards/{id}", put(routes::visualizations::update_dashboard))
        // Visualizations
        .route("/visualizations", get(routes::visualizations::list_all))
        .route("/visualizations", post(routes::visualizations::create))
        .route("/visualizations/{id}", get(routes::visualizations::get))
        .route("/visualizations/{id}", put(routes::visualizations::update))
        .route("/visualizations/{id}", delete(routes::visualizations::delete))
        .route("/visualizations/{id}/publish", post(routes::visualizations::publish))
        // Dashboards
        .route("/dashboards", get(routes::visualizations::list_dashboards))
        .route("/dashboards", post(routes::visualizations::create_dashboard))
        .route("/dashboards/{id}", get(routes::visualizations::get_dashboard))
        .route("/dashboards/{id}", put(routes::visualizations::update_dashboard))
        .route("/dashboards/{id}", delete(routes::visualizations::delete_dashboard))
        // Admin
        .route("/admin/users", get(routes::admin::list_users))
        .route("/admin/users/{id}", put(routes::admin::update_user))
        .route("/admin/users/{id}", delete(routes::admin::delete_user))
        .route("/admin/stats", get(routes::admin::system_stats))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024)) // 100 MB
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.server_host, config.server_port);
    tracing::info!("Starting OpenModelStudio API on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
