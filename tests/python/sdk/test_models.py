"""Tests for register_model(), publish_version(), load_model(), and ModelHandle."""

import base64
import io
import json
import os
import pickle
import pytest
import responses
from unittest.mock import patch

from openmodelstudio.client import Client, ModelHandle


TEST_API_URL = "http://test-api.local:8080"
TEST_TOKEN = "test-jwt-token-abc123"
TEST_PROJECT_ID = "proj-00000000-0000-0000-0000-000000000001"

# Standard mock response for register-model
REGISTER_RESPONSE = {
    "model_id": "model-00000000-0000-0000-0000-000000000001",
    "name": "test-model",
    "version": 1,
}

PUBLISH_RESPONSE = {
    "model_id": "model-00000000-0000-0000-0000-000000000001",
    "version": 2,
    "change_summary": "updated",
}


class TestRegisterModelSourceCode:
    """register_model() with source_code= path."""

    def test_register_model_with_source_code(self, client, mock_api):
        """Passing source_code string posts it directly."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        code = "def train(ctx): pass\ndef infer(ctx): pass"
        handle = client.register_model("my-model", source_code=code, framework="python")

        body = json.loads(mock_api.calls[0].request.body)
        assert body["source_code"] == code
        assert body["framework"] == "python"
        assert isinstance(handle, ModelHandle)


class TestRegisterModelFromFile:
    """register_model() with file= parameter."""

    def test_register_model_with_file(self, client, mock_api, tmp_path):
        """Reads file contents, infers framework from imports."""
        model_file = tmp_path / "train.py"
        model_file.write_text(
            "import torch\nimport torch.nn as nn\n"
            "def train(ctx): pass\ndef infer(ctx): pass\n"
        )
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        handle = client.register_model("torch-model", file=str(model_file))

        body = json.loads(mock_api.calls[0].request.body)
        assert "import torch" in body["source_code"]
        assert body["framework"] == "pytorch"
        assert isinstance(handle, ModelHandle)

    def test_register_model_with_file_sklearn(self, client, mock_api, tmp_path):
        """Infers sklearn framework from imports."""
        model_file = tmp_path / "train.py"
        model_file.write_text(
            "from sklearn.linear_model import LogisticRegression\n"
            "def train(ctx): pass\n"
        )
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        handle = client.register_model("sk-model", file=str(model_file))

        body = json.loads(mock_api.calls[0].request.body)
        assert body["framework"] == "sklearn"

    def test_register_model_with_file_not_found(self, client):
        """FileNotFoundError when file path does not exist."""
        with pytest.raises(FileNotFoundError, match="Model file not found"):
            client.register_model("bad-model", file="/nonexistent/model.py")


class TestRegisterModelWithObject:
    """register_model() with a trained model object — auto-detect, serialize, codegen."""

    @pytest.mark.skipif(
        not pytest.importorskip("sklearn", reason="sklearn required"),
        reason="sklearn not available",
    )
    def test_register_model_with_sklearn_object(self, client, mock_api, sklearn_model):
        """Auto-detects sklearn, serializes, generates source code with embedded blob."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        handle = client.register_model("sklearn-clf", model=sklearn_model)

        body = json.loads(mock_api.calls[0].request.body)
        assert body["framework"] == "sklearn"
        assert "_MODEL_B64" in body["source_code"]
        assert "def train(ctx):" in body["source_code"]
        assert "def infer(ctx):" in body["source_code"]
        assert handle.name == "test-model"

    @pytest.mark.skipif(
        not pytest.importorskip("torch", reason="torch required"),
        reason="torch not available",
    )
    def test_register_model_with_pytorch_object(self, client, mock_api, pytorch_model):
        """Auto-detects pytorch, serializes nn.Module, generates source with embedded blob."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        handle = client.register_model("pytorch-net", model=pytorch_model)

        body = json.loads(mock_api.calls[0].request.body)
        assert body["framework"] == "pytorch"
        assert "_MODEL_B64" in body["source_code"]
        assert "import torch" in body["source_code"]
        assert "def train(ctx):" in body["source_code"]
        assert "def infer(ctx):" in body["source_code"]
        assert handle.model_id == REGISTER_RESPONSE["model_id"]

    def test_register_model_with_tensorflow_object(self, client, mock_api, tf_model):
        """Auto-detects tensorflow, serializes Keras model, generates source with embedded blob."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        handle = client.register_model("keras-net", model=tf_model)

        body = json.loads(mock_api.calls[0].request.body)
        assert body["framework"] == "tensorflow"
        assert "_MODEL_B64" in body["source_code"]
        assert "def train(ctx):" in body["source_code"]
        assert "def infer(ctx):" in body["source_code"]
        assert handle.model_id == REGISTER_RESPONSE["model_id"]


class TestRegisterModelReturnValue:
    """register_model() returns a fully populated ModelHandle."""

    def test_register_model_returns_model_handle(self, client, mock_api):
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        handle = client.register_model("test-model", source_code="def train(ctx): pass")
        assert isinstance(handle, ModelHandle)
        assert handle.model_id == REGISTER_RESPONSE["model_id"]
        assert handle.name == REGISTER_RESPONSE["name"]
        assert handle.version == REGISTER_RESPONSE["version"]


class TestRegisterModelEndpoint:
    """register_model() posts to the correct endpoint and includes project_id."""

    def test_register_model_posts_to_correct_endpoint(self, client, mock_api):
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test", source_code="def train(ctx): pass")
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/sdk/register-model"

    def test_register_model_includes_project_id(self, client, mock_api):
        """Body includes project_id from the client (set via env)."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test", source_code="def train(ctx): pass")
        body = json.loads(mock_api.calls[0].request.body)
        assert body["project_id"] == TEST_PROJECT_ID

    def test_register_model_framework_override(self, client, mock_api):
        """Explicit framework= param overrides any auto-detection."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model(
            "test",
            source_code="import torch\ndef train(ctx): pass",
            framework="python",
        )
        body = json.loads(mock_api.calls[0].request.body)
        assert body["framework"] == "python"


class TestModelHandle:
    """ModelHandle __repr__ and delegation."""

    def test_model_handle_repr(self):
        mock_client = Client(api_url=TEST_API_URL, token=TEST_TOKEN)
        h = ModelHandle(model_id="m-1", name="my-model", version=3, client=mock_client)
        r = repr(h)
        assert "m-1" in r
        assert "my-model" in r
        assert "3" in r
        assert "ModelHandle" in r

    def test_model_handle_publish_version(self, client, mock_api):
        """ModelHandle.publish_version() delegates to client.publish_version()."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/publish-version",
            json=PUBLISH_RESPONSE,
            status=200,
        )
        handle = ModelHandle(model_id="m-1", name="test", version=1, client=client)
        result = handle.publish_version(source_code="def train(ctx): pass")

        body = json.loads(mock_api.calls[0].request.body)
        assert body["model_id"] == "m-1"
        assert body["source_code"] == "def train(ctx): pass"
        assert result["version"] == 2


class TestPublishVersion:
    """Client.publish_version() with source_code and artifact."""

    def test_publish_version_with_source_code(self, client, mock_api):
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/publish-version",
            json=PUBLISH_RESPONSE,
            status=200,
        )
        result = client.publish_version(
            "m-1",
            source_code="def train(ctx): pass\ndef infer(ctx): pass",
            summary="v2 update",
        )
        body = json.loads(mock_api.calls[0].request.body)
        assert body["model_id"] == "m-1"
        assert body["source_code"] == "def train(ctx): pass\ndef infer(ctx): pass"
        assert body["change_summary"] == "v2 update"
        assert result["version"] == 2

    def test_publish_version_with_artifact(self, client, mock_api, tmp_path):
        """Artifact file is base64-encoded and included in POST body."""
        artifact = tmp_path / "model.pkl"
        artifact.write_bytes(b"\x80\x04\x95\x00\x00\x00\x00")  # some pickle bytes
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/publish-version",
            json=PUBLISH_RESPONSE,
            status=200,
        )
        result = client.publish_version("m-1", artifact_path=str(artifact))

        body = json.loads(mock_api.calls[0].request.body)
        assert body["model_id"] == "m-1"
        assert body["artifact_name"] == "model.pkl"
        # Verify the base64 encoding round-trips correctly
        decoded = base64.b64decode(body["artifact_data"])
        assert decoded == b"\x80\x04\x95\x00\x00\x00\x00"


# ---------------------------------------------------------------------------
# load_model — framework-specific deserialization
# ---------------------------------------------------------------------------


class TestLoadModelSklearn:
    """load_model() deserializes sklearn models via pickle."""

    def test_load_model_sklearn(self, client, mock_api, sklearn_model):
        """Roundtrip: serialize sklearn model → mock API → load_model → usable estimator."""
        model_bytes = pickle.dumps(sklearn_model)

        # Mock resolve endpoint
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/resolve/my-clf",
            json={"id": "model-sk-001", "framework": "sklearn"},
            status=200,
        )
        # Mock artifact download
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/model-sk-001/artifact",
            body=model_bytes,
            status=200,
            content_type="application/octet-stream",
        )

        loaded = client.load_model("my-clf")

        assert type(loaded).__name__ == "LogisticRegression"
        # Verify it has the same params as the original
        assert loaded.max_iter == sklearn_model.max_iter


class TestLoadModelPytorch:
    """load_model() deserializes PyTorch models via torch.load."""

    @pytest.mark.skipif(
        not pytest.importorskip("torch", reason="torch required"),
        reason="torch not available",
    )
    def test_load_model_pytorch(self, client, mock_api, pytorch_model):
        """Roundtrip: serialize pytorch model → mock API → load_model → usable nn.Module."""
        import torch

        buf = io.BytesIO()
        torch.save(pytorch_model, buf)
        model_bytes = buf.getvalue()

        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/resolve/my-net",
            json={"id": "model-pt-001", "framework": "pytorch"},
            status=200,
        )
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/model-pt-001/artifact",
            body=model_bytes,
            status=200,
            content_type="application/octet-stream",
        )

        loaded = client.load_model("my-net", device="cpu")

        assert isinstance(loaded, torch.nn.Module)
        # Verify forward pass works
        x = torch.randn(1, 4)
        out = loaded(x)
        assert out.shape == (1, 2)


class TestLoadModelTensorflow:
    """load_model() deserializes TF/Keras models via keras.load_model."""

    def test_load_model_tensorflow(self, client, mock_api, tf_model):
        """Roundtrip: serialize keras model → mock API → load_model → usable model."""
        import tempfile, os
        keras = pytest.importorskip("keras")

        # Serialize the Keras model to .keras bytes
        tmpfile = tempfile.mktemp(suffix=".keras")
        tf_model.save(tmpfile)
        with open(tmpfile, "rb") as f:
            model_bytes = f.read()
        os.unlink(tmpfile)

        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/resolve/my-keras",
            json={"id": "model-tf-001", "framework": "tensorflow"},
            status=200,
        )
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/model-tf-001/artifact",
            body=model_bytes,
            status=200,
            content_type="application/octet-stream",
        )

        loaded = client.load_model("my-keras")

        assert loaded is not None
        # Verify predict works
        import numpy as np
        out = loaded.predict(np.array([[1.0, 2.0, 3.0, 4.0]]), verbose=0)
        assert out.shape == (1, 2)


class TestLoadModelUnsupported:
    """load_model() raises for unknown frameworks."""

    def test_load_model_unsupported_framework(self, client, mock_api):
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/resolve/my-model",
            json={"id": "model-unk-001", "framework": "julia"},
            status=200,
        )
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/models/model-unk-001/artifact",
            body=b"some bytes",
            status=200,
            content_type="application/octet-stream",
        )

        with pytest.raises(ValueError, match="Unsupported framework"):
            client.load_model("my-model")
