"""Tests for list_datasets(), load_dataset(), upload_dataset(), create_dataset()."""

import base64
import io
import json
import os
import pytest
import responses
import pandas as pd

from openmodelstudio.client import Client


TEST_API_URL = "http://test-api.local:8080"
TEST_TOKEN = "test-jwt-token-abc123"
TEST_PROJECT_ID = "proj-00000000-0000-0000-0000-000000000001"

SAMPLE_DATASETS = [
    {"id": "ds-1", "name": "titanic", "format": "csv", "size_bytes": 1024, "row_count": 891},
    {"id": "ds-2", "name": "iris", "format": "parquet", "size_bytes": 2048, "row_count": 150},
]


class TestListDatasets:
    """Client.list_datasets() — GET /sdk/datasets."""

    def test_list_datasets(self, client, mock_api):
        """GET /sdk/datasets includes project_id as a query param."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/datasets",
            json=SAMPLE_DATASETS,
            status=200,
        )
        result = client.list_datasets()
        assert len(result) == 2
        assert result[0]["name"] == "titanic"
        # Verify project_id was sent as a query param
        assert "project_id=" in mock_api.calls[0].request.url
        assert TEST_PROJECT_ID in mock_api.calls[0].request.url

    def test_list_datasets_no_project(self, mock_api, monkeypatch):
        """Works without project_id (no query param sent)."""
        monkeypatch.delenv("OPENMODELSTUDIO_PROJECT_ID", raising=False)
        c = Client(api_url=TEST_API_URL, token=TEST_TOKEN)
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/datasets",
            json=[],
            status=200,
        )
        result = c.list_datasets()
        assert result == []
        # No project_id in the URL
        assert "project_id" not in mock_api.calls[0].request.url


class TestLoadDataset:
    """Client.load_dataset() — finds dataset, downloads content, returns DataFrame."""

    def test_load_dataset_csv(self, client, mock_api):
        """Download CSV content and return a pandas DataFrame."""
        # Mock list_datasets to find the dataset
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/datasets",
            json=SAMPLE_DATASETS,
            status=200,
        )
        # Mock content download
        csv_content = b"name,age,survived\nAlice,29,1\nBob,35,0\nCharlie,42,1\n"
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/datasets/ds-1/content",
            body=csv_content,
            status=200,
            content_type="text/csv",
        )
        df = client.load_dataset("titanic")
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 3
        assert list(df.columns) == ["name", "age", "survived"]

    def test_load_dataset_not_found(self, client, mock_api):
        """ValueError when dataset name is not in the list."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/datasets",
            json=SAMPLE_DATASETS,
            status=200,
        )
        with pytest.raises(ValueError, match="not found"):
            client.load_dataset("nonexistent-dataset")


class TestUploadDataset:
    """Client.upload_dataset() — base64-encodes file and POSTs."""

    def test_upload_dataset(self, client, mock_api, tmp_path):
        """File is base64-encoded and POSTed to /sdk/datasets/{id}/upload."""
        data_file = tmp_path / "data.csv"
        csv_bytes = b"col1,col2\n1,2\n3,4\n"
        data_file.write_bytes(csv_bytes)

        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/datasets/ds-1/upload",
            json={"status": "uploaded"},
            status=200,
        )
        result = client.upload_dataset("ds-1", str(data_file))
        assert result["status"] == "uploaded"

        body = json.loads(mock_api.calls[0].request.body)
        decoded = base64.b64decode(body["data"])
        assert decoded == csv_bytes


class TestCreateDatasetFromDataFrame:
    """Client.create_dataset() with a pandas DataFrame."""

    def test_create_dataset_from_dataframe(self, client, mock_api):
        """DataFrame is converted to CSV bytes and base64-encoded."""
        df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/create-dataset",
            json={"id": "ds-new", "name": "my-data", "format": "csv"},
            status=200,
        )
        result = client.create_dataset("my-data", df)
        assert result["id"] == "ds-new"

        body = json.loads(mock_api.calls[0].request.body)
        assert body["name"] == "my-data"
        assert body["format"] == "csv"
        # Decode and verify CSV content
        decoded = base64.b64decode(body["data"])
        roundtrip = pd.read_csv(io.BytesIO(decoded))
        assert list(roundtrip.columns) == ["a", "b"]
        assert len(roundtrip) == 3

    def test_create_dataset_from_dataframe_parquet(self, client, mock_api):
        """DataFrame with format='parquet' serializes to parquet bytes."""
        df = pd.DataFrame({"x": [10, 20], "y": [30, 40]})
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/create-dataset",
            json={"id": "ds-pq", "name": "pq-data", "format": "parquet"},
            status=200,
        )
        result = client.create_dataset("pq-data", df, format="parquet")

        body = json.loads(mock_api.calls[0].request.body)
        assert body["format"] == "parquet"
        # Verify parquet bytes can be read back
        decoded = base64.b64decode(body["data"])
        roundtrip = pd.read_parquet(io.BytesIO(decoded))
        assert len(roundtrip) == 2
        assert list(roundtrip.columns) == ["x", "y"]


class TestCreateDatasetFromFile:
    """Client.create_dataset() with a file path."""

    def test_create_dataset_from_file_path(self, client, mock_api, tmp_path):
        """Reads file, detects format from extension."""
        csv_file = tmp_path / "data.csv"
        csv_file.write_text("col1,col2\n1,2\n3,4\n")
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/create-dataset",
            json={"id": "ds-file", "name": "file-data", "format": "csv"},
            status=200,
        )
        result = client.create_dataset("file-data", str(csv_file))
        assert result["id"] == "ds-file"

        body = json.loads(mock_api.calls[0].request.body)
        assert body["format"] == "csv"
        assert body["name"] == "file-data"

    def test_create_dataset_from_file_not_found(self, client):
        """FileNotFoundError when file path does not exist."""
        with pytest.raises(FileNotFoundError, match="File not found"):
            client.create_dataset("bad", "/nonexistent/data.csv")


class TestCreateDatasetRowCount:
    """create_dataset() includes row_count from DataFrame len."""

    def test_create_dataset_includes_row_count(self, client, mock_api):
        df = pd.DataFrame({"a": range(42)})
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/create-dataset",
            json={"id": "ds-rc", "name": "counted", "format": "csv"},
            status=200,
        )
        client.create_dataset("counted", df)
        body = json.loads(mock_api.calls[0].request.body)
        assert body["row_count"] == 42


class TestCreateDatasetValidation:
    """create_dataset() rejects invalid input types."""

    def test_create_dataset_non_dataframe_raises(self, client):
        """TypeError for input that is neither a DataFrame nor a file path string."""
        with pytest.raises(TypeError, match="Expected DataFrame or file path"):
            client.create_dataset("bad", 12345)

    def test_create_dataset_list_raises(self, client):
        """A plain list is not accepted."""
        with pytest.raises(TypeError, match="Expected DataFrame or file path"):
            client.create_dataset("bad", [1, 2, 3])

    def test_create_dataset_dict_raises(self, client):
        """A plain dict is not accepted."""
        with pytest.raises(TypeError, match="Expected DataFrame or file path"):
            client.create_dataset("bad", {"a": 1})


class TestCreateDatasetIncludesProjectId:
    """create_dataset() includes project_id from client."""

    def test_project_id_in_body(self, client, mock_api):
        df = pd.DataFrame({"a": [1]})
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/create-dataset",
            json={"id": "ds-pid", "name": "pid-test"},
            status=200,
        )
        client.create_dataset("pid-test", df)
        body = json.loads(mock_api.calls[0].request.body)
        assert body["project_id"] == TEST_PROJECT_ID
