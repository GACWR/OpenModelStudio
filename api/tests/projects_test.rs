use openmodelstudio_api::services::metrics::MetricsService;
use openmodelstudio_api::models::job::MetricEvent;
use uuid::Uuid;

#[tokio::test]
async fn test_metrics_service_pub_sub() {
    let svc = MetricsService::new();
    let job_id = Uuid::new_v4();

    let mut rx = svc.subscribe(job_id).await;

    let event = MetricEvent {
        metric_name: "loss".into(),
        value: 0.5,
        step: Some(1),
        epoch: Some(1),
        metadata: None,
        timestamp: chrono::Utc::now(),
    };

    svc.broadcast(job_id, event.clone()).await;

    let received = rx.recv().await.unwrap();
    assert_eq!(received.metric_name, "loss");
    assert_eq!(received.value, 0.5);
}

#[tokio::test]
async fn test_metrics_service_remove() {
    let svc = MetricsService::new();
    let job_id = Uuid::new_v4();

    let _rx = svc.subscribe(job_id).await;
    svc.remove(&job_id).await;

    // After removal, publish should silently do nothing
    let event = MetricEvent {
        metric_name: "loss".into(),
        value: 0.1,
        step: None,
        epoch: None,
        metadata: None,
        timestamp: chrono::Utc::now(),
    };
    svc.broadcast(job_id, event).await;
}
