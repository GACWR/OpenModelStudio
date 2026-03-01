"""Tests for Client logging methods: log_metric, post_log, get_logs."""

import json
import pytest
import responses

from openmodelstudio.client import Client

from conftest import TEST_API_URL, TEST_PROJECT_ID


# ---------------------------------------------------------------------------
# log_metric
# ---------------------------------------------------------------------------


class TestLogMetric:
    """Tests for Client.log_metric()."""

    def test_log_metric(self, client, mock_api):
        """POST /internal/metrics/{job_id} with metric_name and value."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/internal/metrics/job-001",
            json={"ok": True},
            status=200,
        )

        client.log_metric("job-001", "loss", 0.45)

        body = json.loads(mock_api.calls[0].request.body)
        assert body["metric_name"] == "loss"
        assert body["value"] == 0.45
        assert "timestamp" in body
        # step and epoch should be absent when not provided
        assert "step" not in body
        assert "epoch" not in body

    def test_log_metric_with_step_and_epoch(self, client, mock_api):
        """Both optional step and epoch are included in the body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/internal/metrics/job-002",
            json={"ok": True},
            status=200,
        )

        client.log_metric("job-002", "accuracy", 0.92, step=150, epoch=3)

        body = json.loads(mock_api.calls[0].request.body)
        assert body["metric_name"] == "accuracy"
        assert body["value"] == 0.92
        assert body["step"] == 150
        assert body["epoch"] == 3

    def test_log_metric_timestamp_included(self, client, mock_api):
        """Body always includes an ISO-format timestamp."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/internal/metrics/job-003",
            json={"ok": True},
            status=200,
        )

        client.log_metric("job-003", "f1", 0.88)

        body = json.loads(mock_api.calls[0].request.body)
        assert "timestamp" in body
        # Should be a valid ISO timestamp string (contains 'T' separator)
        ts = body["timestamp"]
        assert "T" in ts
        # Should end with timezone info ('+00:00' or 'Z')
        assert "+00:00" in ts or ts.endswith("Z")


# ---------------------------------------------------------------------------
# post_log
# ---------------------------------------------------------------------------


class TestPostLog:
    """Tests for Client.post_log()."""

    def test_post_log(self, client, mock_api):
        """POST /internal/logs/{job_id} with logs array containing one entry."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/internal/logs/job-010",
            json={"ok": True},
            status=200,
        )

        client.post_log("job-010", "Training started successfully")

        body = json.loads(mock_api.calls[0].request.body)
        assert "logs" in body
        assert len(body["logs"]) == 1
        entry = body["logs"][0]
        assert entry["level"] == "info"
        assert entry["message"] == "Training started successfully"
        assert "timestamp" in entry
        assert "logger_name" not in entry

    def test_post_log_with_logger_name(self, client, mock_api):
        """Optional logger_name is included in the log entry."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/internal/logs/job-011",
            json={"ok": True},
            status=200,
        )

        client.post_log(
            "job-011",
            "GPU memory warning",
            level="warning",
            logger_name="training.gpu",
        )

        body = json.loads(mock_api.calls[0].request.body)
        entry = body["logs"][0]
        assert entry["level"] == "warning"
        assert entry["message"] == "GPU memory warning"
        assert entry["logger_name"] == "training.gpu"
        assert "timestamp" in entry


# ---------------------------------------------------------------------------
# get_logs
# ---------------------------------------------------------------------------


class TestGetLogs:
    """Tests for Client.get_logs()."""

    def test_get_logs(self, client, mock_api):
        """GET /training/{job_id}/logs returns log entries."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/training/job-020/logs",
            json=[
                {"level": "info", "message": "Epoch 1 started", "timestamp": "2026-03-01T00:00:00Z"},
                {"level": "info", "message": "Epoch 1 done", "timestamp": "2026-03-01T00:01:00Z"},
            ],
            status=200,
        )

        result = client.get_logs("job-020")

        assert len(result) == 2
        assert result[0]["message"] == "Epoch 1 started"
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/training/job-020/logs"

    def test_get_logs_with_filters(self, client, mock_api):
        """level, limit, and offset are sent as query params."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/training/job-021/logs",
            json=[
                {"level": "error", "message": "OOM", "timestamp": "2026-03-01T00:05:00Z"},
            ],
            status=200,
        )

        result = client.get_logs("job-021", level="error", limit=50, offset=10)

        request_url = mock_api.calls[0].request.url
        assert "level=error" in request_url
        assert "limit=50" in request_url
        assert "offset=10" in request_url
        assert len(result) == 1
        assert result[0]["level"] == "error"
