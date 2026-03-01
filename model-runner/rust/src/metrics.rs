use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
pub struct MetricEntry {
    pub name: String,
    pub value: f64,
    pub timestamp: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub epoch: Option<i64>,
}

pub struct MetricReporter {
    api_url: String,
    job_id: String,
    buffer: Arc<Mutex<Vec<MetricEntry>>>,
}

impl MetricReporter {
    pub fn new(api_url: String, job_id: String) -> Self {
        Self {
            api_url,
            job_id,
            buffer: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn log(&self, name: &str, value: f64, step: Option<i64>, epoch: Option<i64>) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs_f64();

        let entry = MetricEntry {
            name: name.to_string(),
            value,
            timestamp,
            step,
            epoch,
        };

        let mut buf = self.buffer.lock().unwrap();
        buf.push(entry);

        // Auto-flush at 50 entries
        if buf.len() >= 50 {
            let batch: Vec<_> = buf.drain(..).collect();
            drop(buf);
            let _ = self.flush_batch(batch);
        }
    }

    fn flush_batch(&self, batch: Vec<MetricEntry>) -> Result<(), Box<dyn std::error::Error>> {
        let client = reqwest::blocking::Client::new();
        let url = format!("{}/api/jobs/{}/metrics", self.api_url, self.job_id);
        client.post(&url)
            .json(&serde_json::json!({"metrics": batch}))
            .timeout(std::time::Duration::from_secs(10))
            .send()?;
        Ok(())
    }

    pub fn flush(&self) {
        let mut buf = self.buffer.lock().unwrap();
        if buf.is_empty() { return; }
        let batch: Vec<_> = buf.drain(..).collect();
        drop(buf);
        let _ = self.flush_batch(batch);
    }
}

impl Drop for MetricReporter {
    fn drop(&mut self) {
        self.flush();
    }
}
