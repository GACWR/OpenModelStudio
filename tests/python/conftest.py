"""Shared fixtures for OpenModelStudio Python SDK & model runner tests."""

import os
import sys
import pytest
import responses as responses_lib
from unittest.mock import MagicMock

# Add model-runner to path so its modules can be imported
MODEL_RUNNER_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "model-runner", "python")
if MODEL_RUNNER_DIR not in sys.path:
    sys.path.insert(0, os.path.abspath(MODEL_RUNNER_DIR))

# Add SDK to path
SDK_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python")
if SDK_DIR not in sys.path:
    sys.path.insert(0, os.path.abspath(SDK_DIR))


# ── Availability checks ──────────────────────────────────────────────

def _has_sklearn():
    try:
        import sklearn
        return True
    except ImportError:
        return False


def _has_torch():
    try:
        import torch
        return True
    except ImportError:
        return False


def _has_tf():
    try:
        import tensorflow
        return True
    except ImportError:
        return False


requires_sklearn = pytest.mark.skipif(not _has_sklearn(), reason="scikit-learn not installed")
requires_torch = pytest.mark.skipif(not _has_torch(), reason="PyTorch not installed")
requires_tf = pytest.mark.skipif(not _has_tf(), reason="TensorFlow not installed")


# ── Environment variable fixtures ────────────────────────────────────

TEST_API_URL = "http://test-api.local:8080"
TEST_TOKEN = "test-jwt-token-abc123"
TEST_WORKSPACE_ID = "ws-00000000-0000-0000-0000-000000000001"
TEST_PROJECT_ID = "proj-00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def sdk_env(monkeypatch):
    """Set required env vars for Client construction."""
    monkeypatch.setenv("OPENMODELSTUDIO_API_URL", TEST_API_URL)
    monkeypatch.setenv("OPENMODELSTUDIO_TOKEN", TEST_TOKEN)
    monkeypatch.setenv("OPENMODELSTUDIO_WORKSPACE_ID", TEST_WORKSPACE_ID)
    monkeypatch.setenv("OPENMODELSTUDIO_PROJECT_ID", TEST_PROJECT_ID)


@pytest.fixture(autouse=True)
def reset_sdk_singleton():
    """Reset the model.py singleton client between tests."""
    import openmodelstudio.model as model_module
    model_module._client = None
    yield
    model_module._client = None


# ── Client fixture ───────────────────────────────────────────────────

@pytest.fixture
def client():
    """Return a pre-configured Client instance."""
    from openmodelstudio.client import Client
    return Client(api_url=TEST_API_URL, token=TEST_TOKEN)


# ── HTTP mocking fixture ────────────────────────────────────────────

@pytest.fixture
def mock_api():
    """Activate responses library to intercept all HTTP requests."""
    with responses_lib.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        yield rsps


# ── Sample model fixtures ───────────────────────────────────────────

@pytest.fixture
def sklearn_model():
    """Return a simple sklearn LogisticRegression."""
    pytest.importorskip("sklearn")
    from sklearn.linear_model import LogisticRegression
    return LogisticRegression(max_iter=100)


try:
    import torch.nn as _nn

    class SimpleNet(_nn.Module):
        """Module-level class for torch.save pickle compatibility."""
        def __init__(self):
            super().__init__()
            self.fc = _nn.Linear(4, 2)

        def forward(self, x):
            return self.fc(x)

    _HAS_TORCH = True
except ImportError:
    _HAS_TORCH = False


@pytest.fixture
def pytorch_model():
    """Return a simple PyTorch nn.Module."""
    pytest.importorskip("torch")
    return SimpleNet()


@pytest.fixture
def tf_model():
    """Return a simple Keras Sequential model (requires TensorFlow)."""
    keras = pytest.importorskip("keras")
    model = keras.Sequential([
        keras.layers.Dense(8, activation="relu", input_shape=(4,)),
        keras.layers.Dense(2),
    ])
    model.compile(optimizer="adam", loss="mse")
    return model


# ── Mock DB connection ──────────────────────────────────────────────

@pytest.fixture
def mock_db_conn():
    """Return a mock psycopg2 connection and cursor."""
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    cursor.fetchone.return_value = None
    cursor.fetchall.return_value = []
    return conn, cursor


# ── MockModelContext for generated code tests ────────────────────────

class MockModelContext:
    """Lightweight context for testing generated train/infer code."""

    def __init__(self, hyperparameters=None):
        self.model_id = "test-model-id"
        self.job_id = "test-job-id"
        self.hyperparameters = hyperparameters or {}
        self.device = "cpu"
        self._logged_metrics = []
        self._output = None
        self._db_conn = MagicMock()
        cursor_mock = MagicMock()
        cursor_mock.fetchone.return_value = None
        self._db_conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor_mock)
        self._db_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    def log_metric(self, name, value, step=None, epoch=None):
        self._logged_metrics.append((name, value, step, epoch))

    def get_input_data(self):
        if "input_data" in self.hyperparameters:
            return self.hyperparameters["input_data"]
        return self.hyperparameters

    def set_output(self, output):
        self._output = output
