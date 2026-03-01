"""Integration test: register_model() with real model objects → verify generated code executes.

This is the critical test that verifies the SDK model abstraction works end-to-end:
  1. Pass a real model object to register_model()
  2. SDK auto-detects framework, serializes model, generates source code
  3. The generated source code is POSTed to the API
  4. We extract that source code and exec() it with MockModelContext
  5. Verify train(ctx) logs metrics and infer(ctx) produces predictions
"""

import json
import pytest
import responses

from conftest import TEST_API_URL, TEST_PROJECT_ID, MockModelContext


REGISTER_RESPONSE = {
    "model_id": "model-roundtrip-001",
    "name": "roundtrip-test",
    "version": 1,
}


class TestRegisterModelSklearnRoundtrip:
    """register_model(model=sklearn_obj) → extract source → exec train/infer."""

    def test_sklearn_register_and_train(self, client, mock_api, sklearn_model):
        """Full pipeline: register sklearn model → exec generated train()."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test-sklearn", model=sklearn_model)

        # Extract the source code that was POSTed
        body = json.loads(mock_api.calls[0].request.body)
        source_code = body["source_code"]
        assert body["framework"] == "sklearn"

        # Execute the generated train() with MockModelContext
        ctx = MockModelContext(hyperparameters={"n_samples": 50, "n_features": 4})
        ns = {}
        exec(source_code, ns)
        ns["train"](ctx)

        metric_names = [m[0] for m in ctx._logged_metrics]
        assert "accuracy" in metric_names
        assert "loss" in metric_names
        assert "progress" in metric_names
        # Progress should reach 100
        progress_values = [m[1] for m in ctx._logged_metrics if m[0] == "progress"]
        assert 100 in progress_values

    def test_sklearn_register_and_infer(self, client, mock_api, sklearn_model):
        """Full pipeline: register sklearn model → exec generated infer()."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test-sklearn", model=sklearn_model)

        body = json.loads(mock_api.calls[0].request.body)
        source_code = body["source_code"]

        ctx = MockModelContext(
            hyperparameters={"input_data": {"features": [[1.0, 2.0, 3.0, 4.0]]}}
        )
        ns = {}
        exec(source_code, ns)
        ns["infer"](ctx)

        assert ctx._output is not None
        assert "predictions" in ctx._output
        assert isinstance(ctx._output["predictions"], list)


class TestRegisterModelPytorchRoundtrip:
    """register_model(model=pytorch_obj) → extract source → exec train/infer."""

    pytestmark = pytest.mark.skipif(
        not pytest.importorskip("torch", reason="torch not installed"),
        reason="torch not installed",
    )

    def test_pytorch_register_and_train(self, client, mock_api, pytorch_model):
        """Full pipeline: register PyTorch model → exec generated train()."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test-pytorch", model=pytorch_model)

        body = json.loads(mock_api.calls[0].request.body)
        source_code = body["source_code"]
        assert body["framework"] == "pytorch"

        ctx = MockModelContext(hyperparameters={"epochs": 2, "batch_size": 4})
        ns = {}
        exec(source_code, ns)
        ns["train"](ctx)

        metric_names = [m[0] for m in ctx._logged_metrics]
        assert "loss" in metric_names
        assert "accuracy" in metric_names
        assert "progress" in metric_names

    def test_pytorch_register_and_infer(self, client, mock_api, pytorch_model):
        """Full pipeline: register PyTorch model → exec generated infer()."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test-pytorch", model=pytorch_model)

        body = json.loads(mock_api.calls[0].request.body)
        source_code = body["source_code"]

        # SimpleNet has input_size=4
        ctx = MockModelContext(
            hyperparameters={"input_data": {"features": [[1.0, 2.0, 3.0, 4.0]]}}
        )
        ns = {}
        exec(source_code, ns)
        ns["infer"](ctx)

        assert ctx._output is not None
        assert "predictions" in ctx._output
        preds = ctx._output["predictions"]
        assert isinstance(preds, list)
        assert len(preds) == 1  # one sample


class TestRegisterModelTensorflowRoundtrip:
    """register_model(model=keras_obj) → extract source → exec train/infer."""

    def test_tensorflow_register_and_train(self, client, mock_api, tf_model):
        """Full pipeline: register TF/Keras model → exec generated train()."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test-keras", model=tf_model)

        body = json.loads(mock_api.calls[0].request.body)
        source_code = body["source_code"]
        assert body["framework"] == "tensorflow"

        ctx = MockModelContext(hyperparameters={"epochs": 1, "n_samples": 20, "batch_size": 8})
        ns = {}
        exec(source_code, ns)
        ns["train"](ctx)

        metric_names = [m[0] for m in ctx._logged_metrics]
        assert "loss" in metric_names
        assert "progress" in metric_names

    def test_tensorflow_register_and_infer(self, client, mock_api, tf_model):
        """Full pipeline: register TF/Keras model → exec generated infer()."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/register-model",
            json=REGISTER_RESPONSE,
            status=200,
        )
        client.register_model("test-keras", model=tf_model)

        body = json.loads(mock_api.calls[0].request.body)
        source_code = body["source_code"]

        # tf_model has input_shape=(4,)
        ctx = MockModelContext(
            hyperparameters={"input_data": {"features": [[1.0, 2.0, 3.0, 4.0]]}}
        )
        ns = {}
        exec(source_code, ns)
        ns["infer"](ctx)

        assert ctx._output is not None
        assert "predictions" in ctx._output
