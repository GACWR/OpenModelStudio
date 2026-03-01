"""Tests for metrics.MetricReporter."""

import pytest
from unittest.mock import patch, MagicMock


class TestMetricReporter:
    """Verify MetricReporter buffering, flushing, and thread lifecycle."""

    @pytest.fixture(autouse=True)
    def _import_reporter(self):
        """Import MetricReporter (requests must be available)."""
        from metrics import MetricReporter
        self.MetricReporter = MetricReporter

    def _make_reporter(self, endpoint="", job_id="job-123"):
        """Create a reporter; empty endpoint avoids spawning a flush thread."""
        return self.MetricReporter(endpoint, job_id)

    # ── Buffer tests ─────────────────────────────────────────────────

    def test_log_adds_to_buffer(self):
        reporter = self._make_reporter()
        reporter.log("loss", 0.5)
        assert len(reporter._buffer) == 1

    def test_log_entry_format(self):
        reporter = self._make_reporter()
        reporter.log("loss", 0.5)
        entry = reporter._buffer[0]
        assert entry["metric_name"] == "loss"
        assert entry["value"] == 0.5
        assert "timestamp" in entry

    def test_log_with_step_epoch(self):
        reporter = self._make_reporter()
        reporter.log("accuracy", 0.9, step=10, epoch=3)
        entry = reporter._buffer[0]
        assert entry["step"] == 10
        assert entry["epoch"] == 3

    # ── Flush tests ──────────────────────────────────────────────────

    @patch("metrics.requests")
    def test_flush_posts_to_endpoint(self, mock_requests):
        reporter = self.MetricReporter("http://metrics-api.local", "job-abc")
        reporter._running = False  # prevent flush thread loop
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_requests.post.return_value = mock_response

        reporter.log("loss", 0.3)
        assert len(reporter._buffer) == 1

        reporter._flush()
        # Buffer should be emptied after successful flush
        assert len(reporter._buffer) == 0
        mock_requests.post.assert_called()

    @patch("metrics.requests")
    def test_flush_failed_retries(self, mock_requests):
        """500 response should put entries back in the buffer."""
        reporter = self.MetricReporter("http://metrics-api.local", "job-abc")
        reporter._running = False
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_requests.post.return_value = mock_response

        reporter.log("loss", 0.5)
        reporter._flush()

        # Entries should be back in the buffer due to failure
        assert len(reporter._buffer) == 1

    # ── Thread lifecycle ─────────────────────────────────────────────

    def test_close_stops_thread(self):
        reporter = self._make_reporter()
        reporter._running = True
        reporter.close()
        assert reporter._running is False

    def test_no_endpoint_warning(self):
        """Empty endpoint should not start a flush thread."""
        reporter = self._make_reporter(endpoint="")
        assert reporter._thread is None
