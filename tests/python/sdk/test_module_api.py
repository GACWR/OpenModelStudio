"""Tests for the model.py convenience functions and __init__.py module API."""

import pytest
import responses

import openmodelstudio
import openmodelstudio.model as model_module
from openmodelstudio.client import Client


TEST_API_URL = "http://test-api.local:8080"
TEST_TOKEN = "test-jwt-token-abc123"
TEST_PROJECT_ID = "proj-00000000-0000-0000-0000-000000000001"


class TestSingletonClient:
    """_get_client() creates and reuses a single Client instance."""

    def test_singleton_client_created_on_first_call(self):
        """First call to _get_client() creates a Client from env vars."""
        assert model_module._client is None
        c = model_module._get_client()
        assert isinstance(c, Client)
        assert c.api_url == TEST_API_URL
        assert c.token == TEST_TOKEN

    def test_singleton_reused(self):
        """Second call returns the exact same instance (identity check)."""
        c1 = model_module._get_client()
        c2 = model_module._get_client()
        assert c1 is c2

    def test_singleton_missing_env_raises(self, monkeypatch):
        """RuntimeError when OPENMODELSTUDIO_API_URL is not set."""
        monkeypatch.delenv("OPENMODELSTUDIO_API_URL", raising=False)
        # Reset singleton so it tries to create a new one
        model_module._client = None
        with pytest.raises(RuntimeError, match="OPENMODELSTUDIO_API_URL not set"):
            model_module._get_client()


class TestDelegation:
    """Module-level functions delegate to the singleton client methods."""

    def test_register_model_delegates(self, mock_api):
        """model.register_model() calls client.register_model (verified via HTTP mock)."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json={"model_id": "m-1", "name": "test", "version": 1},
            status=200,
        )
        handle = openmodelstudio.register_model("test", source_code="def train(ctx): pass")
        assert handle.model_id == "m-1"
        assert handle.name == "test"
        assert len(mock_api.calls) == 1
        assert "/sdk/register-model" in mock_api.calls[0].request.url

    def test_list_datasets_delegates(self, mock_api):
        """model.list_datasets() calls client.list_datasets (verified via HTTP mock)."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/datasets",
            json=[{"id": "ds-1", "name": "titanic", "format": "csv"}],
            status=200,
        )
        result = openmodelstudio.list_datasets()
        assert len(result) == 1
        assert result[0]["name"] == "titanic"
        assert len(mock_api.calls) == 1
        assert "/sdk/datasets" in mock_api.calls[0].request.url

    def test_publish_version_delegates(self, mock_api):
        """model.publish_version() calls client.publish_version."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/publish-version",
            json={"model_id": "m-1", "version": 2},
            status=200,
        )
        result = openmodelstudio.publish_version("m-1", source_code="def train(ctx): pass")
        assert result["version"] == 2

    def test_create_dataset_delegates(self, mock_api):
        """model.create_dataset() calls client.create_dataset."""
        import pandas as pd

        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/create-dataset",
            json={"id": "ds-new", "name": "df-data", "format": "csv"},
            status=200,
        )
        df = pd.DataFrame({"x": [1, 2]})
        result = openmodelstudio.create_dataset("df-data", df)
        assert result["id"] == "ds-new"

    def test_start_training_delegates(self, mock_api):
        """model.start_training() calls client.start_training."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/start-training",
            json={"job_id": "j-1", "status": "running"},
            status=200,
        )
        result = openmodelstudio.start_training("my-model")
        assert result["job_id"] == "j-1"


class TestAllExports:
    """Every item in __all__ is accessible and (except 'Client') is callable."""

    def test_all_exports_are_callable(self):
        """Every name in __all__ except 'Client' should be a callable function."""
        for name in openmodelstudio.__all__:
            obj = getattr(openmodelstudio, name)
            if name == "Client":
                # Client is a class, which is callable, but we test it separately
                assert isinstance(obj, type)
            else:
                assert callable(obj), f"{name} is not callable"


class TestVersion:
    """__version__ is defined and is a string."""

    def test_version_defined(self):
        assert hasattr(openmodelstudio, "__version__")
        assert isinstance(openmodelstudio.__version__, str)
        assert len(openmodelstudio.__version__) > 0

    def test_version_format(self):
        """Version string looks like a semver (e.g. 0.0.1)."""
        parts = openmodelstudio.__version__.split(".")
        assert len(parts) >= 2, f"Version '{openmodelstudio.__version__}' does not look like semver"


class TestConnectFunction:
    """If there is a connect() function, test it; otherwise skip."""

    def test_connect_returns_client(self):
        """Test connect() if it exists on the module."""
        if not hasattr(openmodelstudio, "connect"):
            pytest.skip("No connect() function defined on openmodelstudio")
        c = openmodelstudio.connect()
        assert isinstance(c, Client)
