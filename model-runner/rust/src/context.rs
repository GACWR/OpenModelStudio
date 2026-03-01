use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tch::Device;

use crate::metrics::MetricReporter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobParams {
    #[serde(flatten)]
    pub params: HashMap<String, serde_json::Value>,
}

pub struct ModelContext {
    pub model_id: String,
    pub job_id: String,
    pub job_type: String,
    pub params: JobParams,
    pub device: Device,
    pub api_url: String,
    pub s3_bucket: String,
    metrics: MetricReporter,
}

impl ModelContext {
    pub fn new(
        model_id: String,
        job_id: String,
        job_type: String,
        params: JobParams,
        api_url: String,
        s3_bucket: String,
    ) -> Self {
        let device = if tch::Cuda::is_available() {
            Device::Cuda(0)
        } else {
            Device::Cpu
        };
        let metrics = MetricReporter::new(api_url.clone(), job_id.clone());
        Self {
            model_id,
            job_id,
            job_type,
            params,
            device,
            api_url,
            s3_bucket,
            metrics,
        }
    }

    pub fn log_metric(&self, name: &str, value: f64, step: Option<i64>, epoch: Option<i64>) {
        self.metrics.log(name, value, step, epoch);
    }

    pub fn get_param_f64(&self, key: &str, default: f64) -> f64 {
        self.params.params.get(key)
            .and_then(|v| v.as_f64())
            .unwrap_or(default)
    }

    pub fn get_param_i64(&self, key: &str, default: i64) -> i64 {
        self.params.params.get(key)
            .and_then(|v| v.as_i64())
            .unwrap_or(default)
    }
}
