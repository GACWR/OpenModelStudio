"""Tests for Client.create_features() and Client.load_features()."""

import json
import pytest
import responses

np = pytest.importorskip("numpy", reason="numpy not installed")
pd = pytest.importorskip("pandas", reason="pandas not installed")

from openmodelstudio.client import Client

from conftest import TEST_API_URL, TEST_PROJECT_ID


# ---------------------------------------------------------------------------
# create_features
# ---------------------------------------------------------------------------


class TestCreateFeatures:
    """Tests for Client.create_features()."""

    def test_create_features_all_numeric(self, client, mock_api):
        """Auto-selects numeric columns when feature_names is omitted."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/features",
            json={"id": "fg-001", "group_name": "features-auto", "features": []},
            status=200,
        )

        df = pd.DataFrame({"age": [25, 30, 35], "fare": [7.5, 12.0, 20.0], "name": ["a", "b", "c"]})
        result = client.create_features(df, group_name="features-auto")

        assert len(mock_api.calls) == 1
        body = json.loads(mock_api.calls[0].request.body)
        feature_names = [f["name"] for f in body["features"]]
        assert "age" in feature_names
        assert "fare" in feature_names
        assert "name" not in feature_names
        assert body["group_name"] == "features-auto"
        assert body["project_id"] == TEST_PROJECT_ID

    def test_create_features_explicit_columns(self, client, mock_api):
        """feature_names parameter filters to only specified columns."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/features",
            json={"id": "fg-002", "group_name": "explicit", "features": []},
            status=200,
        )

        df = pd.DataFrame({"age": [25, 30], "fare": [7.5, 12.0], "pclass": [1, 3]})
        client.create_features(df, feature_names=["age", "fare"], group_name="explicit")

        body = json.loads(mock_api.calls[0].request.body)
        feature_names = [f["name"] for f in body["features"]]
        assert feature_names == ["age", "fare"]
        assert "pclass" not in feature_names

    def test_create_features_with_transforms(self, client, mock_api):
        """Transforms config is included in the feature definitions."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/features",
            json={"id": "fg-003"},
            status=200,
        )

        df = pd.DataFrame({"age": [25, 30, 35], "fare": [7.5, 12.0, 20.0]})
        transforms = {"age": "standard_scaler", "fare": "min_max_scaler"}
        client.create_features(df, group_name="with-transforms", transforms=transforms)

        body = json.loads(mock_api.calls[0].request.body)
        features_by_name = {f["name"]: f for f in body["features"]}
        assert features_by_name["age"]["config"]["transform"] == "standard_scaler"
        assert features_by_name["fare"]["config"]["transform"] == "min_max_scaler"

    def test_create_features_computes_stats(self, client, mock_api):
        """mean, std, min, max, null_rate are computed for numeric columns."""
        mock_api.add(
            responses.POST,
            f"{TEST_API_URL}/sdk/features",
            json={"id": "fg-004"},
            status=200,
        )

        df = pd.DataFrame({"val": [10.0, 20.0, 30.0, np.nan]})
        client.create_features(df, group_name="stats-test")

        body = json.loads(mock_api.calls[0].request.body)
        feat = body["features"][0]
        config = feat["config"]
        assert config["mean"] == pytest.approx(20.0)
        assert config["std"] == pytest.approx(10.0)
        assert config["min"] == pytest.approx(10.0)
        assert config["max"] == pytest.approx(30.0)
        assert feat["null_rate"] == pytest.approx(0.25)

    def test_create_features_non_dataframe_raises(self, client, mock_api):
        """Passing a non-DataFrame raises TypeError."""
        with pytest.raises(TypeError, match="Expected DataFrame"):
            client.create_features({"age": [1, 2, 3]}, group_name="bad")


# ---------------------------------------------------------------------------
# load_features
# ---------------------------------------------------------------------------


class TestLoadFeatures:
    """Tests for Client.load_features()."""

    def _mock_feature_group(self, mock_api, features):
        """Helper to register a GET /sdk/features/group/{name} mock."""
        mock_api.add(
            responses.GET,
            f"{TEST_API_URL}/sdk/features/group/my-features",
            json={"group_name": "my-features", "features": features},
            status=200,
        )

    def test_load_features_no_df(self, client, mock_api):
        """Without a DataFrame, returns raw feature definitions."""
        features = [
            {"name": "age", "feature_type": "numerical", "config": {"mean": 30, "std": 5}},
        ]
        self._mock_feature_group(mock_api, features)

        result = client.load_features("my-features")
        assert result["group_name"] == "my-features"
        assert len(result["features"]) == 1
        assert result["features"][0]["name"] == "age"

    def test_load_features_standard_scaler(self, client, mock_api):
        """standard_scaler applies (x - mean) / std."""
        features = [
            {
                "name": "age",
                "feature_type": "numerical",
                "config": {"transform": "standard_scaler", "mean": 30.0, "std": 10.0},
            },
        ]
        self._mock_feature_group(mock_api, features)

        df = pd.DataFrame({"age": [20.0, 30.0, 40.0]})
        result = client.load_features("my-features", df=df)

        expected = pd.Series([-1.0, 0.0, 1.0], name="age")
        pd.testing.assert_series_equal(result["age"], expected)

    def test_load_features_min_max_scaler(self, client, mock_api):
        """min_max_scaler applies (x - min) / (max - min)."""
        features = [
            {
                "name": "fare",
                "feature_type": "numerical",
                "config": {"transform": "min_max_scaler", "min": 0.0, "max": 100.0},
            },
        ]
        self._mock_feature_group(mock_api, features)

        df = pd.DataFrame({"fare": [0.0, 50.0, 100.0]})
        result = client.load_features("my-features", df=df)

        expected = pd.Series([0.0, 0.5, 1.0], name="fare")
        pd.testing.assert_series_equal(result["fare"], expected)

    def test_load_features_log_transform(self, client, mock_api):
        """log_transform applies np.log1p to the column."""
        features = [
            {
                "name": "income",
                "feature_type": "numerical",
                "config": {"transform": "log_transform"},
            },
        ]
        self._mock_feature_group(mock_api, features)

        df = pd.DataFrame({"income": [0.0, 1.0, 99.0]})
        result = client.load_features("my-features", df=df)

        expected = pd.Series(np.log1p([0.0, 1.0, 99.0]), name="income")
        pd.testing.assert_series_equal(result["income"], expected)

    def test_load_features_one_hot(self, client, mock_api):
        """one_hot applies pd.get_dummies, dropping original column."""
        features = [
            {
                "name": "color",
                "feature_type": "categorical",
                "config": {"transform": "one_hot"},
            },
        ]
        self._mock_feature_group(mock_api, features)

        df = pd.DataFrame({"color": ["red", "blue", "red"], "value": [1, 2, 3]})
        result = client.load_features("my-features", df=df)

        assert "color" not in result.columns
        # get_dummies produces bool columns by default in recent pandas
        assert "color_red" in result.columns
        assert "color_blue" in result.columns
        assert "value" in result.columns
        assert list(result["value"]) == [1, 2, 3]
