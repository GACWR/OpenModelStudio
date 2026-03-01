"""Tests for context.ModelContext."""

import json
import logging
import pytest
from unittest.mock import MagicMock, patch, PropertyMock


class TestModelContext:
    """Verify ModelContext behaviour with mocked dependencies."""

    @pytest.fixture(autouse=True)
    def _patch_imports(self, monkeypatch):
        """Patch torch, MetricReporter, and ArtifactManager before importing context."""
        # Create mock torch module
        self.mock_torch = MagicMock()
        self.mock_torch.device = MagicMock(side_effect=lambda x: x)
        self.mock_torch.cuda.is_available = MagicMock(return_value=False)
        # Mock MPS as unavailable
        self.mock_torch.backends.mps.is_available = MagicMock(return_value=False)
        # Ensure hasattr(torch.backends, 'mps') returns True so the code branch is hit
        self.mock_torch.backends.__contains__ = MagicMock(return_value=True)
        self.mock_torch.nn = MagicMock()

        self.mock_metric_reporter_cls = MagicMock()
        self.mock_metric_reporter = MagicMock()
        self.mock_metric_reporter_cls.return_value = self.mock_metric_reporter

        self.mock_artifact_manager_cls = MagicMock()
        self.mock_artifact_manager = MagicMock()
        self.mock_artifact_manager_cls.return_value = self.mock_artifact_manager

        import sys
        # Ensure fresh import by removing cached module
        for mod_name in list(sys.modules.keys()):
            if mod_name == "context":
                del sys.modules[mod_name]

        monkeypatch.setitem(sys.modules, "torch", self.mock_torch)
        monkeypatch.setitem(sys.modules, "torch.nn", self.mock_torch.nn)

        # Patch metrics and artifact_manager modules
        mock_metrics_mod = MagicMock()
        mock_metrics_mod.MetricReporter = self.mock_metric_reporter_cls
        monkeypatch.setitem(sys.modules, "metrics", mock_metrics_mod)

        mock_artifacts_mod = MagicMock()
        mock_artifacts_mod.ArtifactManager = self.mock_artifact_manager_cls
        monkeypatch.setitem(sys.modules, "artifact_manager", mock_artifacts_mod)

        # Now import context fresh
        import importlib
        self.context_mod = importlib.import_module("context")

    def _make_ctx(self, hyperparameters=None):
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
        conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        ctx = self.context_mod.ModelContext(
            model_id="model-123",
            job_id="job-456-abcdefgh",
            hyperparameters=hyperparameters or {},
            metrics_endpoint="",
            db_conn=conn,
            s3_bucket="test-bucket",
        )
        ctx._cursor = cursor
        ctx._conn = conn
        return ctx

    def test_context_device_cpu(self):
        """When CUDA and MPS are unavailable, device should be cpu."""
        ctx = self._make_ctx()
        # _detect_device should have been called with mocked torch
        # The mock returns the string passed to torch.device
        assert ctx.device == "cpu"

    def test_context_log_metric_delegates(self):
        """ctx.log_metric() should delegate to the MetricReporter."""
        ctx = self._make_ctx()
        ctx.log_metric("loss", 0.5, step=1, epoch=2)
        self.mock_metric_reporter.log.assert_called_once_with("loss", 0.5, step=1, epoch=2)

    def test_context_get_input_data_direct(self):
        """When hyperparameters lack 'input_data' key, return hyperparameters directly."""
        ctx = self._make_ctx(hyperparameters={"lr": 0.01, "epochs": 5})
        result = ctx.get_input_data()
        assert result == {"lr": 0.01, "epochs": 5}

    def test_context_get_input_data_nested(self):
        """When hyperparameters have an 'input_data' key, return that nested value."""
        ctx = self._make_ctx(
            hyperparameters={"input_data": {"features": [1, 2, 3]}}
        )
        result = ctx.get_input_data()
        assert result == {"features": [1, 2, 3]}

    def test_context_set_output(self):
        """set_output() should UPDATE the jobs table via the cursor."""
        ctx = self._make_ctx()
        output = {"predictions": [0, 1]}
        ctx.set_output(output)
        # Verify the cursor.execute was called with an UPDATE statement
        cursor = ctx._conn.cursor.return_value.__enter__.return_value
        cursor.execute.assert_called_once()
        call_args = cursor.execute.call_args
        assert "UPDATE jobs SET metrics" in call_args[0][0]
        assert ctx.job_id in call_args[0][1]

    def test_context_log_convenience(self):
        """ctx.log('msg') should call the logger."""
        ctx = self._make_ctx()
        with patch.object(ctx.logger, "info") as mock_info:
            ctx.log("hello world")
            mock_info.assert_called_once_with("hello world")

    def test_context_close(self):
        """close() should call _metrics.close() and remove log handler."""
        ctx = self._make_ctx()
        ctx.close()
        self.mock_metric_reporter.close.assert_called_once()
