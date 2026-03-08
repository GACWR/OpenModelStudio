#!/usr/bin/env python3
"""OpenModelStudio model runner entrypoint.

Runs inside ephemeral K8s pods. Connects directly to PostgreSQL
to fetch model code and update job status. Posts metrics via HTTP
to the internal metrics endpoint.
"""

import importlib.util
import json
import logging
import os
import sys
import traceback

import psycopg2

from context import ModelContext
from model_interface import ModelInterface

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("openmodelstudio.runner")


def get_env(name, required=False, default=None):
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return val


def fetch_source_code(conn, model_id):
    """Fetch model source code from DB. models.source_code holds the current version;
    model_versions holds archived prior versions."""
    with conn.cursor() as cur:
        # Current version lives in models table
        cur.execute("SELECT source_code FROM models WHERE id = %s", (model_id,))
        row = cur.fetchone()
        if row and row[0]:
            return row[0]

        # Fallback: latest archived version
        cur.execute(
            "SELECT source_code FROM model_versions WHERE model_id = %s "
            "ORDER BY version DESC LIMIT 1",
            (model_id,),
        )
        row = cur.fetchone()
        if row and row[0]:
            return row[0]

    raise RuntimeError(f"No source code found for model {model_id}")


def update_job_status(conn, job_id, status, error_message=None, progress=None):
    """Update job status directly in PostgreSQL."""
    with conn.cursor() as cur:
        if status == "running":
            cur.execute(
                "UPDATE jobs SET status = 'running', "
                "started_at = COALESCE(started_at, NOW()), "
                "updated_at = NOW() WHERE id = %s",
                (job_id,),
            )
        elif status == "completed":
            cur.execute(
                "UPDATE jobs SET status = 'completed', completed_at = NOW(), "
                "updated_at = NOW(), progress = 100 WHERE id = %s",
                (job_id,),
            )
        elif status == "failed":
            cur.execute(
                "UPDATE jobs SET status = 'failed', completed_at = NOW(), "
                "updated_at = NOW(), error_message = %s WHERE id = %s",
                (error_message[:4096] if error_message else None, job_id),
            )
        conn.commit()


def load_model_from_source(source):
    """Dynamically load a model from source code string."""
    model_path = "/tmp/user_model.py"
    with open(model_path, "w") as f:
        f.write(source)

    spec = importlib.util.spec_from_file_location("user_model", model_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["user_model"] = module
    spec.loader.exec_module(module)

    # Option 1: ModelInterface subclass
    for attr_name in dir(module):
        attr = getattr(module, attr_name)
        if (
            isinstance(attr, type)
            and issubclass(attr, ModelInterface)
            and attr is not ModelInterface
        ):
            return attr()

    # Option 2: train/infer functions
    if hasattr(module, "train") or hasattr(module, "infer"):

        class _Wrapper(ModelInterface):
            def train(self, ctx):
                if hasattr(module, "train"):
                    return module.train(ctx)

            def infer(self, ctx):
                if hasattr(module, "infer"):
                    return module.infer(ctx)

        return _Wrapper()

    # Option 3: standalone script — return None, we'll exec it
    return None


def main():
    model_id = get_env("MODEL_ID", required=True)
    job_id = get_env("JOB_ID", required=True)
    job_type = get_env("JOB_TYPE", default="training")
    db_url = get_env("DB_URL", required=True)
    s3_bucket = get_env("S3_BUCKET", default="openmodelstudio")
    metrics_endpoint = get_env("METRICS_ENDPOINT", default="")
    dataset_id = get_env("DATASET_ID")
    hyperparameters_raw = get_env("HYPERPARAMETERS")

    # Parse hyperparameters
    hyperparameters = {}
    if hyperparameters_raw:
        try:
            hyperparameters = json.loads(hyperparameters_raw)
        except json.JSONDecodeError:
            logger.warning("Failed to parse HYPERPARAMETERS JSON, using empty dict")

    logger.info(f"Starting {job_type} job {job_id} for model {model_id}")

    # Connect to PostgreSQL
    conn = psycopg2.connect(db_url)
    conn.autocommit = False

    try:
        # Mark job as running
        update_job_status(conn, job_id, "running")
        logger.info("Job status: running")

        # Fetch model source code
        source = fetch_source_code(conn, model_id)
        logger.info(f"Fetched source code ({len(source)} chars)")

        # Build context
        ctx = ModelContext(
            model_id=model_id,
            job_id=job_id,
            hyperparameters=hyperparameters,
            metrics_endpoint=metrics_endpoint,
            db_conn=conn,
            s3_bucket=s3_bucket,
        )

        # Load and execute model
        model = load_model_from_source(source)

        if model is not None:
            if job_type == "inference":
                logger.info("Executing infer(ctx)...")
                model.infer(ctx)
            else:
                logger.info("Executing train(ctx)...")
                model.train(ctx)
        else:
            # Standalone script — exec with ctx available
            logger.info("Executing standalone script with ctx in globals...")
            exec(source, {"ctx": ctx, "__name__": "__main__"})

        # Flush metrics
        ctx.close()

        # Mark job as completed
        update_job_status(conn, job_id, "completed")
        logger.info("Job completed successfully")

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"Job failed: {e}\n{tb}")
        try:
            update_job_status(conn, job_id, "failed", error_message=str(e))
        except Exception:
            logger.error("Failed to update job status to failed")
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
