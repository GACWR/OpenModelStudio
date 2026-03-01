"""End-to-end test: hyperparameter sweep creation and monitoring."""

import json
import pytest
import responses

from conftest import TEST_API_URL, TEST_PROJECT_ID


@responses.activate
def test_full_sweep_workflow(client):
    """Create sweep -> poll status -> stop."""
    sweep_id = "sweep-001"

    # Mock create sweep
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/sweeps",
        json={"sweep_id": sweep_id, "status": "running", "trials_completed": 0},
        status=200,
    )

    # Mock get sweep (running -> still running -> completed)
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/sweeps/{sweep_id}",
        json={"status": "running", "trials_completed": 5, "max_trials": 20},
        status=200,
    )
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/sdk/sweeps/{sweep_id}",
        json={
            "status": "completed",
            "trials_completed": 20,
            "max_trials": 20,
            "best_trial": {
                "parameters": {"lr": 0.005, "batch_size": 32},
                "metrics": {"val_loss": 0.12},
            },
        },
        status=200,
    )

    # Execute workflow
    search_space = {
        "lr": {"type": "log_uniform", "min": 1e-5, "max": 1e-1},
        "batch_size": {"type": "choice", "values": [16, 32, 64]},
        "epochs": {"type": "int_range", "min": 5, "max": 50},
    }

    # Create sweep with wait
    import time
    original_sleep = time.sleep
    time.sleep = lambda x: None
    try:
        result = client.create_sweep(
            "lr-search",
            model_id="my-model",
            dataset_id="titanic",
            search_space=search_space,
            max_trials=20,
            objective_metric="val_loss",
            objective_direction="minimize",
            wait=True,
        )
    finally:
        time.sleep = original_sleep

    assert result["status"] == "completed"
    assert result["best_trial"]["parameters"]["lr"] == 0.005

    # Verify create request body
    body = json.loads(responses.calls[0].request.body)
    assert body["name"] == "lr-search"
    assert body["model_id"] == "my-model"
    assert body["dataset_id"] == "titanic"
    assert body["search_space"] == search_space
    assert body["max_trials"] == 20
    assert body["objective_metric"] == "val_loss"
    assert body["objective_direction"] == "minimize"
    assert body["project_id"] == TEST_PROJECT_ID


@responses.activate
def test_sweep_stop(client):
    """Create sweep then stop it early."""
    sweep_id = "sweep-002"

    # Mock create
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/sweeps",
        json={"sweep_id": sweep_id, "status": "running"},
        status=200,
    )

    # Mock stop
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/sdk/sweeps/{sweep_id}/stop",
        json={"status": "stopped", "trials_completed": 7},
        status=200,
    )

    sweep = client.create_sweep(
        "quick-search",
        model_id="my-model",
        dataset_id="data",
        search_space={"lr": {"type": "uniform", "min": 0.001, "max": 0.1}},
    )
    assert sweep["sweep_id"] == sweep_id

    stopped = client.stop_sweep(sweep_id)
    assert stopped["status"] == "stopped"
