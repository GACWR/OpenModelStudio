"""Tests for Client experiment methods."""

import json
import pytest
import responses

from openmodelstudio.client import Client

from conftest import TEST_API_URL, TEST_PROJECT_ID


class TestCreateExperiment:
    """Tests for Client.create_experiment()."""

    def test_create_experiment(self, client, mock_api):
        """POST /experiments with name and project_id."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/experiments",
            json={"id": "exp-001", "name": "lr-sweep-v1"},
            status=200,
        )

        result = client.create_experiment("lr-sweep-v1")

        body = json.loads(mock_api.calls[0].request.body)
        assert body["name"] == "lr-sweep-v1"
        assert body["project_id"] == TEST_PROJECT_ID
        assert "description" not in body
        assert result["id"] == "exp-001"

    def test_create_experiment_with_description(self, client, mock_api):
        """Optional description is included in the POST body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/experiments",
            json={"id": "exp-002", "name": "described-exp"},
            status=200,
        )

        client.create_experiment("described-exp", description="Testing different learning rates")

        body = json.loads(mock_api.calls[0].request.body)
        assert body["description"] == "Testing different learning rates"
        assert body["name"] == "described-exp"


class TestListExperiments:
    """Tests for Client.list_experiments()."""

    def test_list_experiments_with_project(self, client, mock_api):
        """GET /projects/{pid}/experiments when project_id is available."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/projects/{TEST_PROJECT_ID}/experiments",
            json=[
                {"id": "exp-001", "name": "exp-alpha"},
                {"id": "exp-002", "name": "exp-beta"},
            ],
            status=200,
        )

        result = client.list_experiments()

        assert len(result) == 2
        assert result[0]["name"] == "exp-alpha"
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/projects/{TEST_PROJECT_ID}/experiments"

    def test_list_experiments_no_project(self, client, mock_api):
        """GET /experiments when project_id is explicitly None."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/experiments",
            json=[{"id": "exp-003", "name": "global-exp"}],
            status=200,
        )

        # Override project_id to None so it falls through to /experiments
        client.project_id = None
        result = client.list_experiments(project_id=None)

        assert len(result) == 1
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/experiments"


class TestGetExperiment:
    """Tests for Client.get_experiment()."""

    def test_get_experiment(self, client, mock_api):
        """GET /experiments/{id} returns experiment details."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/experiments/exp-001",
            json={
                "id": "exp-001",
                "name": "lr-sweep-v1",
                "run_count": 5,
                "status": "active",
            },
            status=200,
        )

        result = client.get_experiment("exp-001")

        assert result["id"] == "exp-001"
        assert result["name"] == "lr-sweep-v1"
        assert result["run_count"] == 5
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/experiments/exp-001"


class TestAddExperimentRun:
    """Tests for Client.add_experiment_run()."""

    def test_add_experiment_run(self, client, mock_api):
        """POST /experiments/{id}/runs with minimal body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/experiments/exp-001/runs",
            json={"id": "run-001", "experiment_id": "exp-001"},
            status=200,
        )

        result = client.add_experiment_run("exp-001")

        body = json.loads(mock_api.calls[0].request.body)
        assert body == {}
        assert result["id"] == "run-001"

    def test_add_experiment_run_all_params(self, client, mock_api):
        """job_id, parameters, and metrics all included in POST body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/experiments/exp-002/runs",
            json={"id": "run-002", "experiment_id": "exp-002"},
            status=200,
        )

        client.add_experiment_run(
            "exp-002",
            job_id="job-t-100",
            parameters={"lr": 0.001, "batch_size": 64},
            metrics={"accuracy": 0.95, "loss": 0.12},
        )

        body = json.loads(mock_api.calls[0].request.body)
        assert body["job_id"] == "job-t-100"
        assert body["parameters"] == {"lr": 0.001, "batch_size": 64}
        assert body["metrics"] == {"accuracy": 0.95, "loss": 0.12}


class TestListExperimentRuns:
    """Tests for Client.list_experiment_runs()."""

    def test_list_experiment_runs(self, client, mock_api):
        """GET /experiments/{id}/runs returns list of runs."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/experiments/exp-001/runs",
            json=[
                {"id": "run-001", "parameters": {"lr": 0.01}, "metrics": {"accuracy": 0.90}},
                {"id": "run-002", "parameters": {"lr": 0.001}, "metrics": {"accuracy": 0.95}},
            ],
            status=200,
        )

        result = client.list_experiment_runs("exp-001")

        assert len(result) == 2
        assert result[1]["metrics"]["accuracy"] == 0.95
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/experiments/exp-001/runs"


class TestCompareExperimentRuns:
    """Tests for Client.compare_experiment_runs()."""

    def test_compare_experiment_runs(self, client, mock_api):
        """GET /experiments/{id}/compare returns comparison data."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/experiments/exp-001/compare",
            json={
                "experiment_id": "exp-001",
                "runs": [
                    {"id": "run-001", "parameters": {"lr": 0.01}, "metrics": {"accuracy": 0.90}},
                    {"id": "run-002", "parameters": {"lr": 0.001}, "metrics": {"accuracy": 0.95}},
                ],
                "best_run": "run-002",
            },
            status=200,
        )

        result = client.compare_experiment_runs("exp-001")

        assert result["best_run"] == "run-002"
        assert len(result["runs"]) == 2
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/experiments/exp-001/compare"


class TestDeleteExperiment:
    """Tests for Client.delete_experiment()."""

    def test_delete_experiment(self, client, mock_api):
        """DELETE /experiments/{id} removes the experiment."""
        mock_api.add(
            responses.DELETE,
            f"{TEST_API_URL}/experiments/exp-001",
            json={"deleted": True, "id": "exp-001"},
            status=200,
        )

        result = client.delete_experiment("exp-001")

        assert result["deleted"] is True
        assert mock_api.calls[0].request.method == "DELETE"
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/experiments/exp-001"
