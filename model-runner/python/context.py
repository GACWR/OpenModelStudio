"""ModelContext — the primary interface passed to user models."""

import io
import json
import logging
import os
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import torch
import torch.nn as nn

from metrics import MetricReporter
from artifact_manager import ArtifactManager

logger = logging.getLogger("openmodelstudio.context")


class ModelLogHandler(logging.Handler):
    """Custom logging handler that captures log records and batch-posts
    them to the API's /internal/logs/{job_id} endpoint.

    Uses buffered batch inserts via HTTP POST (matching MetricReporter's approach).
    """

    def __init__(self, logs_endpoint: str, job_id: str, buffer_size: int = 10, flush_interval: float = 2.0):
        super().__init__()
        self.logs_endpoint = logs_endpoint.rstrip("/")
        self.job_id = job_id
        self.buffer_size = buffer_size
        self.flush_interval = flush_interval
        self._buffer: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._running = True

        if self.logs_endpoint:
            self._thread = threading.Thread(target=self._flush_loop, daemon=True)
            self._thread.start()
        else:
            self._thread = None

    def emit(self, record):
        entry = {
            "level": record.levelname.lower(),
            "message": self.format(record),
            "logger_name": record.name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        should_flush = False
        with self._lock:
            self._buffer.append(entry)
            if len(self._buffer) >= self.buffer_size:
                should_flush = True
        if should_flush:
            self._flush_now()

    def _flush_loop(self):
        while self._running:
            time.sleep(self.flush_interval)
            self._flush_now()

    def _flush_now(self):
        with self._lock:
            if not self._buffer:
                return
            batch = self._buffer[:]
            self._buffer.clear()

        if not self.logs_endpoint:
            return

        url = f"{self.logs_endpoint}/{self.job_id}"
        try:
            import requests as req_lib
            resp = req_lib.post(url, json={"logs": batch}, timeout=10)
            if resp.status_code >= 400:
                print(f"[ModelLogHandler] POST returned {resp.status_code}", file=sys.stderr)
        except Exception as e:
            print(f"[ModelLogHandler] failed to flush logs: {e}", file=sys.stderr)

    def close(self):
        self._running = False
        self._flush_now()
        if self._thread:
            self._thread.join(timeout=5)
        super().close()


class ModelContext:
    """Context object passed to model.train() and model.infer().

    Provides metric logging, checkpointing, artifact management,
    persistent logging, and hyperparameter access.
    """

    def __init__(
        self,
        model_id: str,
        job_id: str,
        hyperparameters: Dict[str, Any],
        metrics_endpoint: str,
        db_conn,
        s3_bucket: str = "openmodelstudio",
    ):
        self.model_id = model_id
        self.job_id = job_id
        self.hyperparameters = hyperparameters
        self.device = self._detect_device()
        self.dataset = None  # Users load their own data for now

        self._db_conn = db_conn
        self._metrics = MetricReporter(metrics_endpoint, job_id)
        self._artifacts = ArtifactManager(
            s3_bucket, model_id, job_id, db_conn=db_conn
        )

        # Auto-injected logging — persists to DB via API
        self._log_handler = None
        logs_endpoint = os.environ.get("LOGS_ENDPOINT", "")
        if logs_endpoint:
            self._log_handler = ModelLogHandler(logs_endpoint, job_id)
            self._log_handler.setFormatter(logging.Formatter("%(message)s"))
            logging.getLogger().addHandler(self._log_handler)

        self.logger = logging.getLogger(f"openmodelstudio.model.{job_id[:8]}")

    @staticmethod
    def _detect_device() -> torch.device:
        if torch.cuda.is_available():
            return torch.device("cuda")
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")

    def log(self, message: str, level: str = "info"):
        """Log a message that persists to the database.

        Convenience method — equivalent to ctx.logger.info(message).
        """
        getattr(self.logger, level, self.logger.info)(message)

    def log_metric(
        self,
        name: str,
        value: float,
        step: Optional[int] = None,
        epoch: Optional[int] = None,
    ):
        """Log a metric value. Streamed to the API for real-time UI updates."""
        self._metrics.log(name, value, step=step, epoch=epoch)

    def save_checkpoint(
        self,
        model: nn.Module,
        optimizer=None,
        epoch: Optional[int] = None,
        metrics: Optional[Dict] = None,
    ):
        """Save model checkpoint to S3."""
        buffer = io.BytesIO()
        state = {"model_state_dict": model.state_dict()}
        if optimizer is not None:
            state["optimizer_state_dict"] = optimizer.state_dict()
        if epoch is not None:
            state["epoch"] = epoch
        if metrics:
            state["metrics"] = metrics
        torch.save(state, buffer)
        metadata = {"epoch": epoch} if epoch else {}
        self._artifacts.upload_checkpoint(
            buffer.getvalue(), epoch=epoch, metadata=metadata
        )

    def load_checkpoint(self, version: Optional[int] = None) -> Dict[str, Any]:
        """Load checkpoint from S3. Returns state dict."""
        data = self._artifacts.download_checkpoint(epoch=version)
        buffer = io.BytesIO(data)
        return torch.load(buffer, map_location=self.device, weights_only=False)

    def save_artifact(
        self,
        local_path: str,
        name: str,
        artifact_type: str = "model_weights",
    ):
        """Upload a local file as an artifact to S3 and register in DB."""
        with open(local_path, "rb") as f:
            data = f.read()
        self._artifacts.upload_artifact(name, data, artifact_type=artifact_type)

    def get_input_data(self) -> dict:
        """Get input data for inference (passed via hyperparameters)."""
        # input_data may be nested under "input_data" key, or be the hyperparameters directly
        if "input_data" in self.hyperparameters:
            return self.hyperparameters["input_data"]
        return self.hyperparameters

    def set_output(self, output):
        """Store inference output in the job's metrics JSONB field."""
        with self._db_conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET metrics = %s, updated_at = NOW() WHERE id = %s",
                (json.dumps(output) if not isinstance(output, str) else output, self.job_id),
            )
        self._db_conn.commit()

    def close(self):
        """Flush metrics, logs, and clean up."""
        self._metrics.close()
        if self._log_handler:
            self._log_handler.close()
            logging.getLogger().removeHandler(self._log_handler)
