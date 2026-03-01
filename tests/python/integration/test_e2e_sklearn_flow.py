"""End-to-end test: full sklearn workflow with all HTTP calls mocked."""

import pytest
import responses

from conftest import TEST_API_URL, TEST_PROJECT_ID


@responses.activate
def test_full_sklearn_register_train_infer(client, sklearn_model):
    """Register sklearn model -> start training -> poll -> start inference -> get result."""
    # Mock register-model
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/register-model",
        json={"model_id": "m-001", "name": "test-clf", "version": 1},
        status=200,
    )

    # Mock start-training
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/start-training",
        json={"job_id": "j-train-001", "status": "queued"},
        status=200,
    )

    # Mock job polling: queued -> running -> completed
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/jobs/j-train-001",
        json={"status": "running", "job_id": "j-train-001"},
        status=200,
    )
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/jobs/j-train-001",
        json={"status": "completed", "job_id": "j-train-001", "metrics": {"accuracy": 0.95}},
        status=200,
    )

    # Mock start-inference
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/start-inference",
        json={"job_id": "j-infer-001", "status": "queued"},
        status=200,
    )

    # Mock inference job polling
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/jobs/j-infer-001",
        json={"status": "completed", "job_id": "j-infer-001", "metrics": {"predictions": [0, 1]}},
        status=200,
    )

    # Execute workflow
    handle = client.register_model("test-clf", model=sklearn_model)
    assert handle.model_id == "m-001"
    assert handle.name == "test-clf"
    assert handle.version == 1

    # Start training
    job = client.start_training("m-001", hyperparameters={"epochs": 5})
    assert job["job_id"] == "j-train-001"

    # Wait for training
    result = client.wait_for_job("j-train-001", poll_interval=0.01)
    assert result["status"] == "completed"
    assert result["metrics"]["accuracy"] == 0.95

    # Start inference
    infer_job = client.start_inference("m-001", input_data={"features": [[1, 2, 3, 4]]})
    assert infer_job["job_id"] == "j-infer-001"

    # Wait for inference
    infer_result = client.wait_for_job("j-infer-001", poll_interval=0.01)
    assert infer_result["status"] == "completed"

    # Verify all expected calls were made
    assert len(responses.calls) == 6


@responses.activate
def test_sklearn_register_with_description(client, sklearn_model):
    """Register with explicit description and framework override."""
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/register-model",
        json={"model_id": "m-002", "name": "custom-clf", "version": 1},
        status=200,
    )

    handle = client.register_model(
        "custom-clf",
        model=sklearn_model,
        framework="sklearn",
        description="My custom classifier",
    )
    assert handle.model_id == "m-002"

    # Verify request body
    import json
    body = json.loads(responses.calls[0].request.body)
    assert body["name"] == "custom-clf"
    assert body["framework"] == "sklearn"
    assert body["description"] == "My custom classifier"
    assert "source_code" in body
