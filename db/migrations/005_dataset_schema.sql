-- Add schema JSONB column to datasets table for storing inferred column info.
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS schema JSONB;
