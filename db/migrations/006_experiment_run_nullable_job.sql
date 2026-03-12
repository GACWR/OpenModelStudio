-- Make job_id nullable in experiment_runs for notebook-based runs without a K8s job.
ALTER TABLE experiment_runs ALTER COLUMN job_id DROP NOT NULL;
-- Change cascade to SET NULL so deleting a job doesn't delete experiment runs.
ALTER TABLE experiment_runs DROP CONSTRAINT IF EXISTS experiment_runs_job_id_fkey;
ALTER TABLE experiment_runs ADD CONSTRAINT experiment_runs_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
