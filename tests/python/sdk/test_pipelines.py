"""Tests for Client pipeline methods: create_pipeline, run_pipeline, get_pipeline, list_pipelines."""

import json
from unittest.mock import patch
import pytest
import responses

from openmodelstudio.client import Client

from conftest import TEST_API_URL, TEST_PROJECT_ID


class TestCreatePipeline:
    """Tests for Client.create_pipeline()."""

    def test_create_pipeline(self, client, mock_api):
        """POST /sdk/pipelines with name, steps, and project_id."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/pipelines",
            json={"id": "pipe-001", "name": "train-and-infer", "status": "created"},
            status=200,
        )

        steps = [
            {"type": "training", "model_id": "m-1", "dataset_id": "ds-1"},
            {"type": "inference", "model_id": "m-1", "input_data": {"features": [1, 2]}},
        ]
        result = client.create_pipeline("train-and-infer", steps)

        body = json.loads(mock_api.calls[0].request.body)
        assert body["name"] == "train-and-infer"
        assert len(body["steps"]) == 2
        assert body["steps"][0]["type"] == "training"
        assert body["steps"][1]["type"] == "inference"
        assert body["project_id"] == TEST_PROJECT_ID
        assert "description" not in body
        assert result["id"] == "pipe-001"

    def test_create_pipeline_with_description(self, client, mock_api):
        """Optional description is included in the POST body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/pipelines",
            json={"id": "pipe-002", "name": "described-pipe"},
            status=200,
        )

        client.create_pipeline(
            "described-pipe",
            [{"type": "training", "model_id": "m-1"}],
            description="End-to-end training pipeline",
        )

        body = json.loads(mock_api.calls[0].request.body)
        assert body["description"] == "End-to-end training pipeline"


class TestRunPipeline:
    """Tests for Client.run_pipeline()."""

    def test_run_pipeline(self, client, mock_api):
        """POST /sdk/pipelines/{id}/run with empty body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/pipelines/pipe-001/run",
            json={"pipeline_id": "pipe-001", "status": "running"},
            status=200,
        )

        result = client.run_pipeline("pipe-001")

        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/sdk/pipelines/pipe-001/run"
        body = json.loads(mock_api.calls[0].request.body)
        assert body == {}
        assert result["status"] == "running"

    def test_run_pipeline_with_wait(self, client, mock_api):
        """wait=True polls get_pipeline until pipeline status is completed."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/pipelines/pipe-003/run",
            json={"pipeline_id": "pipe-003", "status": "running"},
            status=200,
        )
        # First poll: still running
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/pipelines/pipe-003/status",
            json={"pipeline": {"id": "pipe-003", "status": "running"}, "steps": []},
            status=200,
        )
        # Second poll: completed
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/pipelines/pipe-003/status",
            json={"pipeline": {"id": "pipe-003", "status": "completed"}, "steps": [{"status": "done"}]},
            status=200,
        )

        # Patch time.sleep to avoid real delays
        with patch("time.sleep", return_value=None):
            result = client.run_pipeline("pipe-003", wait=True)

        assert result["pipeline"]["status"] == "completed"
        # 1 POST + 2 GETs
        assert len(mock_api.calls) == 3


class TestGetPipeline:
    """Tests for Client.get_pipeline()."""

    def test_get_pipeline(self, client, mock_api):
        """GET /sdk/pipelines/{id}/status returns pipeline and steps."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/pipelines/pipe-001/status",
            json={
                "pipeline": {"id": "pipe-001", "name": "my-pipe", "status": "completed"},
                "steps": [
                    {"step": 1, "type": "training", "status": "completed"},
                    {"step": 2, "type": "inference", "status": "completed"},
                ],
            },
            status=200,
        )

        result = client.get_pipeline("pipe-001")

        assert result["pipeline"]["status"] == "completed"
        assert len(result["steps"]) == 2
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/sdk/pipelines/pipe-001/status"


class TestListPipelines:
    """Tests for Client.list_pipelines()."""

    def test_list_pipelines(self, client, mock_api):
        """GET /sdk/pipelines with project_id param."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/pipelines",
            json=[
                {"id": "pipe-001", "name": "train-pipe"},
                {"id": "pipe-002", "name": "infer-pipe"},
            ],
            status=200,
        )

        result = client.list_pipelines()

        assert len(result) == 2
        request_url = mock_api.calls[0].request.url
        assert f"project_id={TEST_PROJECT_ID}" in request_url

    def test_list_pipelines_with_project(self, client, mock_api):
        """project_id is included as query param from client.project_id."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/pipelines",
            json=[],
            status=200,
        )

        result = client.list_pipelines()

        request_url = mock_api.calls[0].request.url
        assert f"project_id={TEST_PROJECT_ID}" in request_url
        assert result == []
