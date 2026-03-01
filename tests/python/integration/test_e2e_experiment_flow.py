"""End-to-end test: experiment creation, run tracking, and comparison."""

import json
import pytest
import responses

from conftest import TEST_API_URL, TEST_PROJECT_ID


@responses.activate
def test_full_experiment_workflow(client):
    """Create experiment -> add runs -> compare."""
    exp_id = "exp-001"

    # Mock create experiment
    responses.add(
        responses.POST,
        f"{TEST_API_URL}/experiments",
        json={"id": exp_id, "name": "lr-sweep-v1", "project_id": TEST_PROJECT_ID},
        status=200,
    )

    # Mock add 3 runs
    for i in range(3):
        responses.add(
            responses.POST,
            f"{TEST_API_URL}/experiments/{exp_id}/runs",
            json={"run_id": f"run-{i}", "experiment_id": exp_id},
            status=200,
        )

    # Mock list runs
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/experiments/{exp_id}/runs",
        json=[
            {"run_id": "run-0", "parameters": {"lr": 0.001}, "metrics": {"accuracy": 0.90}},
            {"run_id": "run-1", "parameters": {"lr": 0.01}, "metrics": {"accuracy": 0.95}},
            {"run_id": "run-2", "parameters": {"lr": 0.1}, "metrics": {"accuracy": 0.85}},
        ],
        status=200,
    )

    # Mock compare
    responses.add(
        responses.GET,
        f"{TEST_API_URL}/experiments/{exp_id}/compare",
        json={
            "experiment_id": exp_id,
            "runs": [
                {"run_id": "run-0", "parameters": {"lr": 0.001}, "metrics": {"accuracy": 0.90}},
                {"run_id": "run-1", "parameters": {"lr": 0.01}, "metrics": {"accuracy": 0.95}},
                {"run_id": "run-2", "parameters": {"lr": 0.1}, "metrics": {"accuracy": 0.85}},
            ],
            "best_run": "run-1",
        },
        status=200,
    )

    # Mock delete
    responses.add(
        responses.DELETE,
        f"{TEST_API_URL}/experiments/{exp_id}",
        json={"deleted": True},
        status=200,
    )

    # Execute workflow
    exp = client.create_experiment("lr-sweep-v1")
    assert exp["id"] == exp_id

    # Add runs
    lrs = [0.001, 0.01, 0.1]
    accs = [0.90, 0.95, 0.85]
    for i, (lr, acc) in enumerate(zip(lrs, accs)):
        run = client.add_experiment_run(
            exp_id,
            job_id=f"j-{i}",
            parameters={"lr": lr},
            metrics={"accuracy": acc},
        )
        assert run["run_id"] == f"run-{i}"

    # List runs
    runs = client.list_experiment_runs(exp_id)
    assert len(runs) == 3

    # Compare
    comparison = client.compare_experiment_runs(exp_id)
    assert comparison["best_run"] == "run-1"

    # Cleanup
    deleted = client.delete_experiment(exp_id)
    assert deleted["deleted"] is True

    # Verify total calls: 1 create + 3 runs + 1 list + 1 compare + 1 delete = 7
    assert len(responses.calls) == 7
