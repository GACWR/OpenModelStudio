"""End-to-end test: pipeline creation, execution, and status polling."""

import json
import pytest
import responses

from conftest import TEST_API_URL, TEST_PROJECT_ID


@responses.activate
def test_full_pipeline_workflow(client):
    """Create pipeline -> run -> poll until completed."""
    pipe_id = "pipe-001"

    # Mock create pipeline
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/pipelines",
        json={"id": pipe_id, "name": "train-and-infer", "status": "created"},
        status=200,
    )

    # Mock run pipeline
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/pipelines/{pipe_id}/run",
        json={"id": pipe_id, "status": "running"},
        status=200,
    )

    # Mock get pipeline (running then completed)
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/pipelines/{pipe_id}/status",
        json={"pipeline": {"id": pipe_id, "status": "running", "current_step": 1}},
        status=200,
    )
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/pipelines/{pipe_id}/status",
        json={"pipeline": {"id": pipe_id, "status": "completed", "steps_completed": 2}},
        status=200,
    )

    # Mock list pipelines
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/pipelines",
        json=[{"id": pipe_id, "name": "train-and-infer", "status": "completed"}],
        status=200,
    )

    # Execute workflow
    pipeline = client.create_pipeline("train-and-infer", steps=[
        {"type": "training", "model_id": "my-model", "dataset_id": "titanic"},
        {"type": "inference", "model_id": "my-model", "input_data": {"features": [1, 2, 3]}},
    ])
    assert pipeline["id"] == pipe_id

    # Verify request body
    body = json.loads(responses.calls[0].request.body)
    assert body["name"] == "train-and-infer"
    assert len(body["steps"]) == 2
    assert body["project_id"] == TEST_PROJECT_ID

    # Run with wait - note: run_pipeline with wait=True calls get_pipeline in a loop
    # We need to patch time.sleep to avoid real delays
    import time
    original_sleep = time.sleep
    time.sleep = lambda x: None  # no-op sleep
    try:
        result = client.run_pipeline(pipe_id, wait=True)
    finally:
        time.sleep = original_sleep

    assert result["pipeline"]["status"] == "completed"

    # List pipelines
    pipelines = client.list_pipelines()
    assert len(pipelines) == 1
    assert pipelines[0]["name"] == "train-and-infer"
