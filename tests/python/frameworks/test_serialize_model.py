"""Tests for _serialize_model() in openmodelstudio.client."""

import pickle
import pytest
from openmodelstudio.client import _serialize_model


class TestSerializeModel:
    """Verify model serialization for supported frameworks."""

    def test_serialize_sklearn(self, sklearn_model):
        data = _serialize_model(sklearn_model, "sklearn")
        assert isinstance(data, bytes)
        assert len(data) > 0
        # Roundtrip: unpickle should give back an estimator
        restored = pickle.loads(data)
        assert type(restored).__name__ == "LogisticRegression"

    def test_serialize_pytorch(self, pytorch_model):
        import torch
        import io

        data = _serialize_model(pytorch_model, "pytorch")
        assert isinstance(data, bytes)
        assert len(data) > 0
        # Roundtrip: torch.load should recover the module
        buf = io.BytesIO(data)
        restored = torch.load(buf, map_location="cpu", weights_only=False)
        assert isinstance(restored, torch.nn.Module)

    def test_serialize_unsupported_raises(self):
        with pytest.raises(ValueError, match="Unsupported framework"):
            _serialize_model(object(), "unknown_framework")
