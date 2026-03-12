-- Add model_id to experiment_runs so in-process training (no K8s job) can link to the model
ALTER TABLE experiment_runs ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL;
