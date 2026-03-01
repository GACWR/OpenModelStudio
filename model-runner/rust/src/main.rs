mod context;
mod metrics;
mod data_loader;
mod mlp;

use std::env;
use anyhow::{Context as _, Result};
use tracing::info;

use context::{ModelContext, JobParams};

fn get_env(name: &str) -> Result<String> {
    env::var(name).with_context(|| format!("Missing required env var: {name}"))
}

fn get_env_or(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let model_id = get_env("MODEL_ID")?;
    let job_id = get_env("JOB_ID")?;
    let job_type = get_env("JOB_TYPE")?;
    let api_url = get_env("API_URL")?;
    let s3_bucket = get_env("S3_BUCKET")?;
    let model_name = get_env_or("MODEL_NAME", "mlp");

    info!("Starting {job_type} job {job_id} for model {model_id} (arch: {model_name})");

    // Report running status
    let client = reqwest::Client::new();
    let _ = client.post(format!("{api_url}/api/jobs/{job_id}/status"))
        .json(&serde_json::json!({"status": "running"}))
        .send()
        .await;

    // Fetch job details
    let job_resp = client.get(format!("{api_url}/api/jobs/{job_id}"))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let params: JobParams = serde_json::from_value(
        job_resp.get("params").cloned().unwrap_or(serde_json::json!({}))
    )?;

    let ctx = ModelContext::new(
        model_id.clone(),
        job_id.clone(),
        job_type.clone(),
        params,
        api_url.clone(),
        s3_bucket,
    );

    info!("Device: {:?}", ctx.device);

    // Run the appropriate model
    match model_name.as_str() {
        "mlp" => {
            let epochs = ctx.get_param_i64("epochs", 10) as usize;
            let lr = ctx.get_param_f64("lr", 0.01);
            let batch_size = ctx.get_param_i64("batch_size", 64) as usize;

            info!("Training MLP: epochs={epochs}, lr={lr}, batch_size={batch_size}");
            mlp::train_mlp(&ctx, epochs, lr, batch_size)?;
        }
        other => {
            info!("Unknown model '{other}', running no-op");
            ctx.log_metric("runner_started", 1.0, None, None);
        }
    }

    // Report completed
    let _ = client.post(format!("{api_url}/api/jobs/{job_id}/status"))
        .json(&serde_json::json!({"status": "completed"}))
        .send()
        .await;

    info!("Job {job_id} completed");
    Ok(())
}
