"""Tests for Client sweep methods: create_sweep, get_sweep, stop_sweep."""

import json
from unittest.mock import patch
import pytest
import responses

from openmodelstudio.client import Client

from conftest import TEST_API_URL, TEST_PROJECT_ID


class TestCreateSweep:
    """Tests for Client.create_sweep()."""

    def test_create_sweep(self, client, mock_api):
        """POST /sdk/sweeps with all required fields."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/sweeps",
            json={"sweep_id": "sw-001", "status": "running"},
            status=200,
        )

        search_space = {
            "lr": {"type": "log_uniform", "min": 1e-5, "max": 1e-1},
            "batch_size": {"type": "choice", "values": [16, 32, 64]},
            "epochs": {"type": "int_range", "min": 5, "max": 50},
        }

        result = client.create_sweep(
            "lr-search",
            model_id="model-abc",
            dataset_id="ds-001",
            search_space=search_space,
            strategy="grid",
            max_trials=20,
            objective_metric="val_loss",
            objective_direction="minimize",
            hardware_tier="gpu-small",
        )

        body = json.loads(mock_api.calls[0].request.body)
        assert body["name"] == "lr-search"
        assert body["model_id"] == "model-abc"
        assert body["dataset_id"] == "ds-001"
        assert body["search_space"] == search_space
        assert body["strategy"] == "grid"
        assert body["max_trials"] == 20
        assert body["objective_metric"] == "val_loss"
        assert body["objective_direction"] == "minimize"
        assert body["hardware_tier"] == "gpu-small"
        assert body["project_id"] == TEST_PROJECT_ID
        assert result["sweep_id"] == "sw-001"

    def test_create_sweep_defaults(self, client, mock_api):
        """Default values: strategy=random, max_trials=10, etc."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/sweeps",
            json={"sweep_id": "sw-002", "status": "running"},
            status=200,
        )

        search_space = {"lr": {"type": "log_uniform", "min": 1e-4, "max": 1e-2}}

        client.create_sweep(
            "defaults-test",
            model_id="model-def",
            dataset_id="ds-002",
            search_space=search_space,
        )

        body = json.loads(mock_api.calls[0].request.body)
        assert body["strategy"] == "random"
        assert body["max_trials"] == 10
        assert body["objective_metric"] == "loss"
        assert body["objective_direction"] == "minimize"
        assert body["hardware_tier"] == "cpu-small"

    def test_create_sweep_with_wait(self, client, mock_api):
        """wait=True polls GET /sdk/sweeps/{id} until completed."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/sweeps",
            json={"sweep_id": "sw-003", "status": "running"},
            status=200,
        )
        # First poll: still running
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/sweeps/sw-003",
            json={"sweep_id": "sw-003", "status": "running", "trials_completed": 5},
            status=200,
        )
        # Second poll: completed
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/sweeps/sw-003",
            json={
                "sweep_id": "sw-003",
                "status": "completed",
                "trials_completed": 10,
                "best_trial": {"lr": 0.001, "accuracy": 0.97},
            },
            status=200,
        )

        search_space = {"lr": {"type": "log_uniform", "min": 1e-5, "max": 1e-1}}

        with patch("time.sleep", return_value=None):
            result = client.create_sweep(
                "wait-sweep",
                model_id="model-xyz",
                dataset_id="ds-003",
                search_space=search_space,
                wait=True,
            )

        assert result["status"] == "completed"
        assert result["trials_completed"] == 10
        assert result["best_trial"]["accuracy"] == 0.97
        # 1 POST + 2 GETs
        assert len(mock_api.calls) == 3


class TestGetSweep:
    """Tests for Client.get_sweep()."""

    def test_get_sweep(self, client, mock_api):
        """GET /sdk/sweeps/{id} returns sweep details."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/sweeps/sw-001",
            json={
                "sweep_id": "sw-001",
                "name": "lr-search",
                "status": "running",
                "trials_completed": 7,
                "max_trials": 20,
            },
            status=200,
        )

        result = client.get_sweep("sw-001")

        assert result["sweep_id"] == "sw-001"
        assert result["status"] == "running"
        assert result["trials_completed"] == 7
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/sdk/sweeps/sw-001"


class TestStopSweep:
    """Tests for Client.stop_sweep()."""

    def test_stop_sweep(self, client, mock_api):
        """POST /sdk/sweeps/{id}/stop sends empty body."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/sweeps/sw-001/stop",
            json={"sweep_id": "sw-001", "status": "stopped"},
            status=200,
        )

        result = client.stop_sweep("sw-001")

        assert result["status"] == "stopped"
        assert mock_api.calls[0].request.url == f"{TEST_API_URL}/sdk/sweeps/sw-001/stop"
        body = json.loads(mock_api.calls[0].request.body)
        assert body == {}
