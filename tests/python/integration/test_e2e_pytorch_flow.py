"""End-to-end test: full PyTorch workflow with all HTTP calls mocked."""

import json
import pytest
import responses

from conftest import TEST_API_URL, requires_torch


@requires_torch
@responses.activate
def test_full_pytorch_register_and_train(client, pytorch_model):
    """Register PyTorch model -> start training -> poll until completed."""
    # Mock register-model
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/register-model",
        json={"model_id": "m-pt-001", "name": "simple-net", "version": 1},
        status=200,
    )

    # Mock start-training
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/start-training",
        json={"job_id": "j-pt-001", "status": "queued"},
        status=200,
    )

    # Mock job polling
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/jobs/j-pt-001",
        json={"status": "running"},
        status=200,
    )
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/jobs/j-pt-001",
        json={"status": "completed", "metrics": {"loss": 0.01, "accuracy": 0.99}},
        status=200,
    )

    # Execute
    handle = client.register_model("simple-net", model=pytorch_model)
    assert handle.model_id == "m-pt-001"

    # Verify source code was generated with pytorch-specific content
    body = json.loads(responses.calls[0].request.body)
    assert body["framework"] == "pytorch"
    assert "torch" in body["source_code"]
    assert "def train(ctx):" in body["source_code"]
    assert "def infer(ctx):" in body["source_code"]

    # Train
    job = client.start_training("m-pt-001", hyperparameters={"epochs": 10, "lr": 0.001})
    result = client.wait_for_job("j-pt-001", poll_interval=0.01)
    assert result["status"] == "completed"
    assert result["metrics"]["loss"] == 0.01


@requires_torch
@responses.activate
def test_pytorch_publish_version_flow(client, pytorch_model):
    """Register model then publish a new version with updated source code."""
    # Mock register
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/register-model",
        json={"model_id": "m-pt-002", "name": "evolving-net", "version": 1},
        status=200,
    )

    # Mock publish-version
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/publish-version",
        json={"model_id": "m-pt-002", "version": 2},
        status=200,
    )

    handle = client.register_model("evolving-net", model=pytorch_model)
    result = handle.publish_version(source_code="def train(ctx): pass\ndef infer(ctx): pass")
    assert result["version"] == 2
