use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_refresh_secret: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub k8s_namespace: String,
    pub server_host: String,
    pub server_port: u16,
    pub llm_provider: String,
    pub llm_api_key: String,
    pub llm_model: String,
    pub llm_base_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://localhost/openmodelstudio".into()),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into()),
            jwt_refresh_secret: env::var("JWT_REFRESH_SECRET")
                .unwrap_or_else(|_| "dev-refresh-secret-change-me".into()),
            s3_bucket: env::var("S3_BUCKET").unwrap_or_else(|_| "openmodelstudio".into()),
            s3_region: env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".into()),
            k8s_namespace: env::var("K8S_NAMESPACE").unwrap_or_else(|_| "openmodelstudio".into()),
            server_host: env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            server_port: env::var("SERVER_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            llm_provider: env::var("LLM_PROVIDER").unwrap_or_else(|_| "ollama".into()),
            llm_api_key: env::var("LLM_API_KEY").unwrap_or_default(),
            llm_model: env::var("LLM_MODEL").unwrap_or_else(|_| "llama2".into()),
            llm_base_url: env::var("LLM_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:11434".into()),
        }
    }
}
