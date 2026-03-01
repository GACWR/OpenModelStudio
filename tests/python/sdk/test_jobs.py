"""Tests for Client job methods: start_training, start_inference, get_job, wait_for_job, list_jobs."""

import json
import pytest
import responses

from openmodelstudio.client import Client

from conftest import TEST_API_URL, TEST_PROJECT_ID


# ---------------------------------------------------------------------------
# start_training
# ---------------------------------------------------------------------------


class TestStartTraining:
    """Tests for Client.start_training()."""

    def test_start_training_minimal(self, client, mock_api):
        """Only model_id required; hardware_tier defaults to cpu-small."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/start-training",
            json={"job_id": "job-t-001", "status": "pending"},
            status=200,
        )

        result = client.start_training("model-123")

        body = json.loads(mock_api.calls[0].request.body)
        assert body["model_id"] == "model-123"
        assert body["hardware_tier"] == "cpu-small"
        assert body["project_id"] == TEST_PROJECT_ID
        # Optional fields should be absent
        assert "dataset_id" not in body
        assert "hyperparameters" not in body
        assert "hyperparameter_set" not in body
        assert "experiment_id" not in body
        assert result["job_id"] == "job-t-001"

    def test_start_training_full(self, client, mock_api):
        """All optional params included in POST body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/start-training",
            json={"job_id": "job-t-002", "status": "pending"},
            status=200,
        )

        client.start_training(
            "model-456",
            dataset_id="ds-001",
            hyperparameters={"lr": 0.01, "epochs": 5},
            hyperparameter_set="hp-set-001",
            experiment_id="exp-001",
            hardware_tier="gpu-medium",
        )

        body = json.loads(mock_api.calls[0].request.body)
        assert body["model_id"] == "model-456"
        assert body["dataset_id"] == "ds-001"
        assert body["hyperparameters"] == {"lr": 0.01, "epochs": 5}
        assert body["hyperparameter_set"] == "hp-set-001"
        assert body["experiment_id"] == "exp-001"
        assert body["hardware_tier"] == "gpu-medium"
        assert body["project_id"] == TEST_PROJECT_ID

    def test_start_training_with_wait(self, client, mock_api):
        """wait=True polls GET /sdk/jobs/{job_id} until completed."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/start-training",
            json={"job_id": "job-t-003", "status": "pending"},
            status=200,
        )
        # First poll: running
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-t-003",
            json={"job_id": "job-t-003", "status": "running"},
            status=200,
        )
        # Second poll: completed
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-t-003",
            json={"job_id": "job-t-003", "status": "completed", "metrics": {"accuracy": 0.95}},
            status=200,
        )

        result = client.start_training("model-789", wait=True)

        assert result["status"] == "completed"
        assert result["metrics"]["accuracy"] == 0.95
        # At least 1 POST + 2 GETs (background threads may add extra calls)
        assert len(mock_api.calls) >= 3


# ---------------------------------------------------------------------------
# start_inference
# ---------------------------------------------------------------------------


class TestStartInference:
    """Tests for Client.start_inference()."""

    def test_start_inference_minimal(self, client, mock_api):
        """Only model_id required."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/start-inference",
            json={"job_id": "job-i-001", "status": "pending"},
            status=200,
        )

        result = client.start_inference("model-abc")

        body = json.loads(mock_api.calls[0].request.body)
        assert body["model_id"] == "model-abc"
        assert body["hardware_tier"] == "cpu-small"
        assert body["project_id"] == TEST_PROJECT_ID
        assert "input_data" not in body
        assert result["job_id"] == "job-i-001"

    def test_start_inference_with_input_data(self, client, mock_api):
        """input_data is included in the POST body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/start-inference",
            json={"job_id": "job-i-002", "status": "pending"},
            status=200,
        )

        client.start_inference("model-def", input_data={"features": [1.0, 2.0, 3.0]})

        body = json.loads(mock_api.calls[0].request.body)
        assert body["input_data"] == {"features": [1.0, 2.0, 3.0]}

    def test_start_inference_with_wait(self, client, mock_api):
        """wait=True blocks until the job status is completed."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/start-inference",
            json={"job_id": "job-i-003", "status": "pending"},
            status=200,
        )
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-i-003",
            json={"job_id": "job-i-003", "status": "completed", "output": {"predictions": [1]}},
            status=200,
        )

        result = client.start_inference("model-ghi", wait=True)

        assert result["status"] == "completed"
        assert result["output"]["predictions"] == [1]


# ---------------------------------------------------------------------------
# get_job
# ---------------------------------------------------------------------------


class TestGetJob:
    """Tests for Client.get_job()."""

    def test_get_job(self, client, mock_api):
        """GET /sdk/jobs/{job_id} returns job details."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-xyz",
            json={"job_id": "job-xyz", "status": "running", "type": "training"},
            status=200,
        )

        result = client.get_job("job-xyz")

        assert result["job_id"] == "job-xyz"
        assert result["status"] == "running"
        assert mock_api.calls[0].request.method == "GET"
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/sdk/jobs/job-xyz"


# ---------------------------------------------------------------------------
# wait_for_job
# ---------------------------------------------------------------------------


class TestWaitForJob:
    """Tests for Client.wait_for_job()."""

    def test_wait_for_job_immediate_complete(self, client, mock_api):
        """First poll returns completed, so no further polls."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-fast",
            json={"job_id": "job-fast", "status": "completed"},
            status=200,
        )

        result = client.wait_for_job("job-fast", poll_interval=0.01)

        assert result["status"] == "completed"
        assert len(mock_api.calls) == 1

    def test_wait_for_job_multiple_polls(self, client, mock_api):
        """Transitions: pending -> running -> completed."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-slow",
            json={"job_id": "job-slow", "status": "pending"},
            status=200,
        )
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-slow",
            json={"job_id": "job-slow", "status": "running"},
            status=200,
        )
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs/job-slow",
            json={"job_id": "job-slow", "status": "completed", "result": "done"},
            status=200,
        )

        result = client.wait_for_job("job-slow", poll_interval=0.01)

        assert result["status"] == "completed"
        assert result["result"] == "done"
        assert len(mock_api.calls) == 3


# ---------------------------------------------------------------------------
# list_jobs
# ---------------------------------------------------------------------------


class TestListJobs:
    """Tests for Client.list_jobs()."""

    def test_list_jobs_no_filters(self, client, mock_api):
        """GET /sdk/jobs with only project_id param."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs",
            json=[
                {"job_id": "job-1", "type": "training", "status": "completed"},
                {"job_id": "job-2", "type": "inference", "status": "running"},
            ],
            status=200,
        )

        result = client.list_jobs()

        assert len(result) == 2
        request_url = mock_api.calls[0].request.url
        assert f"project_id={TEST_PROJECT_ID}" in request_url
        # No job_type or status params
        assert "job_type=" not in request_url
        assert "status=" not in request_url

    def test_list_jobs_with_type_filter(self, client, mock_api):
        """job_type param is sent when provided."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs",
            json=[{"job_id": "job-t-1", "type": "training"}],
            status=200,
        )

        client.list_jobs(job_type="training")

        request_url = mock_api.calls[0].request.url
        assert "job_type=training" in request_url

    def test_list_jobs_with_status_filter(self, client, mock_api):
        """status param is sent when provided."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/jobs",
            json=[{"job_id": "job-r-1", "status": "running"}],
            status=200,
        )

        client.list_jobs(status="running")

        request_url = mock_api.calls[0].request.url
        assert "status=running" in request_url
