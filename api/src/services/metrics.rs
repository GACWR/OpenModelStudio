use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;
use uuid::Uuid;
use sqlx::PgPool;

use crate::models::job::MetricEvent;

/// Manages SSE broadcast channels for job metrics and persists to DB
#[derive(Clone)]
pub struct MetricsService {
    channels: Arc<RwLock<HashMap<Uuid, broadcast::Sender<MetricEvent>>>>,
}

impl MetricsService {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get or create a broadcast channel for a job
    pub async fn subscribe(&self, job_id: Uuid) -> broadcast::Receiver<MetricEvent> {
        let mut channels = self.channels.write().await;
        let sender = channels
            .entry(job_id)
            .or_insert_with(|| broadcast::channel(256).0);
        sender.subscribe()
    }

    /// Publish a metric event: persist to DB and broadcast to SSE subscribers
    pub async fn publish(&self, db: &PgPool, job_id: Uuid, event: MetricEvent) -> Result<(), sqlx::Error> {
        // Persist to training_metrics table
        sqlx::query(
            "INSERT INTO training_metrics (id, job_id, metric_name, value, step, epoch, metadata, recorded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
        )
        .bind(Uuid::new_v4())
        .bind(job_id)
        .bind(&event.metric_name)
        .bind(event.value)
        .bind(event.step)
        .bind(event.epoch)
        .bind(&event.metadata)
        .bind(event.timestamp)
        .execute(db)
        .await?;

        // Broadcast to SSE subscribers
        let channels = self.channels.read().await;
        if let Some(sender) = channels.get(&job_id) {
            let _ = sender.send(event);
        }

        Ok(())
    }

    /// Get all metrics for a job from DB
    pub async fn get_metrics_history(db: &PgPool, job_id: Uuid) -> Result<Vec<MetricRecord>, sqlx::Error> {
        let records: Vec<MetricRecord> = sqlx::query_as(
            "SELECT id, job_id, metric_name, value, step, epoch, metadata, recorded_at
             FROM training_metrics WHERE job_id = $1 ORDER BY recorded_at ASC"
        )
        .bind(job_id)
        .fetch_all(db)
        .await?;
        Ok(records)
    }

    /// Broadcast a metric event to SSE subscribers without persisting to DB.
    /// Useful for tests or lightweight event forwarding.
    pub async fn broadcast(&self, job_id: Uuid, event: MetricEvent) {
        let channels = self.channels.read().await;
        if let Some(sender) = channels.get(&job_id) {
            let _ = sender.send(event);
        }
    }

    /// Remove channel when job completes
    pub async fn remove(&self, job_id: &Uuid) {
        self.channels.write().await.remove(job_id);
    }
}

impl Default for MetricsService {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct MetricRecord {
    pub id: Uuid,
    pub job_id: Uuid,
    pub metric_name: String,
    pub value: f64,
    pub step: Option<i64>,
    pub epoch: Option<i64>,
    pub metadata: Option<serde_json::Value>,
    pub recorded_at: chrono::DateTime<chrono::Utc>,
}
