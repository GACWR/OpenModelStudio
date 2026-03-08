-- Add registry_name to models table for tracking models installed from the registry.
ALTER TABLE models ADD COLUMN IF NOT EXISTS registry_name TEXT;
CREATE INDEX IF NOT EXISTS idx_models_registry_name ON models(registry_name);
