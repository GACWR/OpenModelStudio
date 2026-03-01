-- Add training_metrics table for persisting metric events from model-runner pods
CREATE TABLE IF NOT EXISTS training_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    step BIGINT,
    epoch BIGINT,
    metadata JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_metrics_job ON training_metrics(job_id);
CREATE INDEX IF NOT EXISTS idx_training_metrics_job_name ON training_metrics(job_id, metric_name);
