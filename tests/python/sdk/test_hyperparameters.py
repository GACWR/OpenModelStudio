"""Tests for Client hyperparameter store methods."""

import json
import pytest
import responses

from openmodelstudio.client import Client

from conftest import TEST_API_URL, TEST_PROJECT_ID


class TestCreateHyperparameters:
    """Tests for Client.create_hyperparameters()."""

    def test_create_hyperparameters(self, client, mock_api):
        """POST body contains name, parameters, and project_id."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/hyperparameters",
            json={"id": "hp-001", "name": "lr-v1", "parameters": {"lr": 0.001}},
            status=200,
        )

        result = client.create_hyperparameters("lr-v1", {"lr": 0.001, "batch_size": 32})

        assert len(mock_api.calls) == 1
        body = json.loads(mock_api.calls[0].request.body)
        assert body["name"] == "lr-v1"
        assert body["parameters"] == {"lr": 0.001, "batch_size": 32}
        assert body["project_id"] == TEST_PROJECT_ID
        assert result["id"] == "hp-001"

    def test_create_hyperparameters_with_model_id(self, client, mock_api):
        """Optional model_id is included in the POST body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/hyperparameters",
            json={"id": "hp-002", "name": "hp-for-model"},
            status=200,
        )

        client.create_hyperparameters(
            "hp-for-model",
            {"epochs": 10},
            model_id="model-abc",
        )

        body = json.loads(mock_api.calls[0].request.body)
        assert body["model_id"] == "model-abc"
        assert body["name"] == "hp-for-model"
        assert body["parameters"] == {"epochs": 10}

    def test_create_hyperparameters_with_description(self, client, mock_api):
        """Optional description is included in the POST body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/hyperparameters",
            json={"id": "hp-003", "name": "described"},
            status=200,
        )

        client.create_hyperparameters(
            "described",
            {"lr": 0.01},
            description="Learning rate search baseline",
        )

        body = json.loads(mock_api.calls[0].request.body)
        assert body["description"] == "Learning rate search baseline"
        assert body["name"] == "described"


class TestLoadHyperparameters:
    """Tests for Client.load_hyperparameters()."""

    def test_load_hyperparameters(self, client, mock_api):
        """GET returns the parameters dict from the response."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/hyperparameters/lr-v1",
            json={
                "id": "hp-001",
                "name": "lr-v1",
                "parameters": {"lr": 0.001, "batch_size": 32, "epochs": 10},
            },
            status=200,
        )

        result = client.load_hyperparameters("lr-v1")

        assert result == {"lr": 0.001, "batch_size": 32, "epochs": 10}
        assert mock_api.calls[0].request.method == "GET"


class TestListHyperparameters:
    """Tests for Client.list_hyperparameters()."""

    def test_list_hyperparameters(self, client, mock_api):
        """GET /sdk/hyperparameters with project_id query param."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/hyperparameters",
            json=[
                {"id": "hp-001", "name": "lr-v1"},
                {"id": "hp-002", "name": "lr-v2"},
            ],
            status=200,
        )

        result = client.list_hyperparameters()

        assert len(result) == 2
        assert result[0]["name"] == "lr-v1"
        # Verify project_id was sent as query param
        request_url = mock_api.calls[0].request.url
        assert f"project_id={TEST_PROJECT_ID}" in request_url
