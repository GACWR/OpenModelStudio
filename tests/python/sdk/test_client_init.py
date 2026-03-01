"""Tests for Client.__init__() — environment variable reading, URL normalization, headers."""

import os
import pytest
from openmodelstudio.client import Client


# Re-use constants from conftest (imported implicitly via fixtures).
TEST_API_URL = "http://test-api.local:8080"
TEST_TOKEN = "test-jwt-token-abc123"
TEST_WORKSPACE_ID = "ws-00000000-0000-0000-0000-000000000001"
TEST_PROJECT_ID = "proj-00000000-0000-0000-0000-000000000001"


class TestClientFromEnv:
    """Client reads connection details from OPENMODELSTUDIO_* env vars."""

    def test_client_from_env_vars(self):
        """Client() with no args picks up all four env vars."""
        c = Client()
        assert c.api_url == TEST_API_URL
        assert c.token == TEST_TOKEN
        assert c.workspace_id == TEST_WORKSPACE_ID
        assert c.project_id == TEST_PROJECT_ID

    def test_client_explicit_args_override_env(self):
        """api_url= and token= keyword arguments take precedence over env vars."""
        c = Client(api_url="http://custom:9090", token="custom-token")
        assert c.api_url == "http://custom:9090"
        assert c.token == "custom-token"

    def test_client_missing_api_url_raises(self, monkeypatch):
        """RuntimeError is raised when no URL is available (env cleared)."""
        monkeypatch.delenv("OPENMODELSTUDIO_API_URL", raising=False)
        with pytest.raises(RuntimeError, match="OPENMODELSTUDIO_API_URL not set"):
            Client()

    def test_client_api_url_trailing_slash_stripped(self):
        """Trailing slashes are stripped from api_url so path joins are clean."""
        c = Client(api_url="http://test-api.local:8080/")
        assert c.api_url == "http://test-api.local:8080"

        c2 = Client(api_url="http://test-api.local:8080///")
        assert not c2.api_url.endswith("/")

    def test_client_empty_token_ok(self, monkeypatch):
        """Token is optional — an empty string does not raise."""
        monkeypatch.setenv("OPENMODELSTUDIO_TOKEN", "")
        c = Client()
        assert c.token == ""

    def test_client_no_token_env_ok(self, monkeypatch):
        """Token env var completely absent is also fine (defaults to empty)."""
        monkeypatch.delenv("OPENMODELSTUDIO_TOKEN", raising=False)
        c = Client()
        assert c.token == ""


class TestHeaders:
    """_headers() builds the correct HTTP header dict."""

    def test_headers_with_token(self):
        """When token is set, Authorization header is included."""
        c = Client(api_url=TEST_API_URL, token="my-jwt")
        h = c._headers()
        assert h["Content-Type"] == "application/json"
        assert h["Authorization"] == "Bearer my-jwt"

    def test_headers_without_token(self, monkeypatch):
        """When token is empty, Authorization header is omitted entirely.

        Note: Client.__init__ uses `token or os.environ.get(...)`, so an empty
        string token parameter is falsy and the env var takes precedence.
        We must also clear the env var to truly get an empty token.
        """
        monkeypatch.delenv("OPENMODELSTUDIO_TOKEN", raising=False)
        c = Client(api_url=TEST_API_URL, token="")
        h = c._headers()
        assert h["Content-Type"] == "application/json"
        assert "Authorization" not in h


class TestWorkspaceAndProjectFromEnv:
    """workspace_id and project_id are populated from env."""

    def test_workspace_id_from_env(self):
        """workspace_id attribute is set from OPENMODELSTUDIO_WORKSPACE_ID."""
        c = Client()
        assert c.workspace_id == TEST_WORKSPACE_ID

    def test_project_id_from_env(self):
        """project_id attribute is set from OPENMODELSTUDIO_PROJECT_ID."""
        c = Client()
        assert c.project_id == TEST_PROJECT_ID

    def test_workspace_id_none_when_unset(self, monkeypatch):
        """workspace_id is None when the env var is absent."""
        monkeypatch.delenv("OPENMODELSTUDIO_WORKSPACE_ID", raising=False)
        c = Client()
        assert c.workspace_id is None

    def test_project_id_none_when_unset(self, monkeypatch):
        """project_id is None when the env var is absent."""
        monkeypatch.delenv("OPENMODELSTUDIO_PROJECT_ID", raising=False)
        c = Client()
        assert c.project_id is None
