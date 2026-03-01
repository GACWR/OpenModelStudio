-- OpenModelStudio Schema Migration — add columns for enriched API responses
-- Run AFTER init.sql

-- ============================================================
-- ADD COLUMNS TO EXISTING TABLES
-- ============================================================

-- projects: stage, health, progress
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'ideation';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS health TEXT NOT NULL DEFAULT 'healthy';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0;

-- models: status, language
ALTER TABLE models ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE models ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'Python';

-- datasets: snapshots
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS snapshots INT NOT NULL DEFAULT 0;

-- jobs: progress tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS epoch_current INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS epoch_total INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS loss DOUBLE PRECISION;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS learning_rate DOUBLE PRECISION;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gpu_config TEXT;

-- workspaces: ide + resource usage
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ide TEXT NOT NULL DEFAULT 'JupyterLab';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS cpu_usage DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ram_usage DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gpu_usage DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS duration TEXT;

-- environments: resource limits + clusters
ALTER TABLE environments ADD COLUMN IF NOT EXISTS cpu_limit TEXT;
ALTER TABLE environments ADD COLUMN IF NOT EXISTS ram_limit TEXT;
ALTER TABLE environments ADD COLUMN IF NOT EXISTS gpu_limit TEXT;
ALTER TABLE environments ADD COLUMN IF NOT EXISTS clusters JSONB;

-- templates: difficulty, stars, icon, color
ALTER TABLE templates ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'Beginner';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS stars INT NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS color TEXT;

-- inference_endpoints: latency, request stats
ALTER TABLE inference_endpoints ADD COLUMN IF NOT EXISTS latency_ms INT;
ALTER TABLE inference_endpoints ADD COLUMN IF NOT EXISTS requests_24h INT NOT NULL DEFAULT 0;
ALTER TABLE inference_endpoints ADD COLUMN IF NOT EXISTS error_rate DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE inference_endpoints ADD COLUMN IF NOT EXISTS cpu_usage DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE inference_endpoints ADD COLUMN IF NOT EXISTS memory_usage DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE inference_endpoints ADD COLUMN IF NOT EXISTS gpu_usage DOUBLE PRECISION NOT NULL DEFAULT 0;

-- experiments: type tag for automl
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS experiment_type TEXT NOT NULL DEFAULT 'manual';

-- features: group_id, stats
ALTER TABLE features ADD COLUMN IF NOT EXISTS group_id UUID;
ALTER TABLE features ADD COLUMN IF NOT EXISTS dtype TEXT;
ALTER TABLE features ADD COLUMN IF NOT EXISTS entity TEXT;
ALTER TABLE features ADD COLUMN IF NOT EXISTS null_rate DOUBLE PRECISION;
ALTER TABLE features ADD COLUMN IF NOT EXISTS mean DOUBLE PRECISION;

-- ============================================================
-- NEW TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    entity TEXT NOT NULL,
    description TEXT,
    serving_status TEXT NOT NULL DEFAULT 'offline',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from features to feature_groups
DO $$ BEGIN
    ALTER TABLE features ADD CONSTRAINT fk_features_group
        FOREIGN KEY (group_id) REFERENCES feature_groups(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    prefix TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS search_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);

-- Add updated_at trigger to new tables
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_feature_groups_updated_at BEFORE UPDATE ON feature_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
