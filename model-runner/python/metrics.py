"""Stream metrics back to the OpenModelStudio API in real-time."""

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import requests

logger = logging.getLogger("openmodelstudio.metrics")


class MetricReporter:
    """Buffers and streams metrics to the internal API endpoint.

    Posts individual MetricEvent objects to POST /internal/metrics/{job_id}.
    """

    def __init__(self, metrics_endpoint: str, job_id: str, flush_interval: float = 2.0):
        self.metrics_endpoint = metrics_endpoint.rstrip("/")
        self.job_id = job_id
        self.flush_interval = flush_interval
        self._buffer: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._running = True

        if self.metrics_endpoint:
            self._thread = threading.Thread(target=self._flush_loop, daemon=True)
            self._thread.start()
        else:
            self._thread = None
            logger.warning("No METRICS_ENDPOINT set, metrics will only be logged locally")

    def log(
        self,
        name: str,
        value: float,
        step: Optional[int] = None,
        epoch: Optional[int] = None,
    ):
        logger.info(f"metric: {name}={value} step={step} epoch={epoch}")
        entry = {
            "metric_name": name,
            "value": float(value),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if step is not None:
            entry["step"] = int(step)
        if epoch is not None:
            entry["epoch"] = int(epoch)
        with self._lock:
            self._buffer.append(entry)

    def _flush_loop(self):
        while self._running:
            time.sleep(self.flush_interval)
            self._flush()

    def _flush(self):
        with self._lock:
            if not self._buffer:
                return
            batch = self._buffer[:]
            self._buffer.clear()

        if not self.metrics_endpoint:
            return

        url = f"{self.metrics_endpoint}/{self.job_id}"
        failed = []
        for entry in batch:
            try:
                resp = requests.post(url, json=entry, timeout=10)
                if resp.status_code >= 400:
                    logger.warning(f"Metrics POST returned {resp.status_code}: {resp.text[:200]}")
                    failed.append(entry)
            except Exception as e:
                logger.warning(f"Failed to post metric: {e}")
                failed.append(entry)

        if failed:
            with self._lock:
                self._buffer = failed + self._buffer

    def close(self):
        self._running = False
        self._flush()
        if self._thread:
            self._thread.join(timeout=5)
