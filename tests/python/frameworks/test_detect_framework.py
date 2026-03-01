"""Tests for _detect_framework() in openmodelstudio.client."""

import pytest
from openmodelstudio.client import _detect_framework


class TestDetectFramework:
    """Verify auto-detection of model frameworks."""

    @pytest.mark.skipif(
        not pytest.importorskip("sklearn", reason="sklearn not installed"),
        reason="sklearn not installed",
    )
    def test_detect_sklearn(self, sklearn_model):
        assert _detect_framework(sklearn_model) == "sklearn"

    @pytest.mark.skipif(
        not pytest.importorskip("torch", reason="torch not installed"),
        reason="torch not installed",
    )
    def test_detect_pytorch(self):
        import torch.nn as nn

        model = nn.Linear(4, 2)
        assert _detect_framework(model) == "pytorch"

    @pytest.mark.skipif(
        not pytest.importorskip("torch", reason="torch not installed"),
        reason="torch not installed",
    )
    def test_detect_pytorch_custom_module(self, pytorch_model):
        assert _detect_framework(pytorch_model) == "pytorch"

    @pytest.mark.parametrize("obj", ["hello", {"a": 1}, 42])
    def test_detect_unknown_raises(self, obj):
        with pytest.raises(TypeError, match="Cannot auto-detect framework"):
            _detect_framework(obj)

    def test_detect_none_raises(self):
        with pytest.raises(TypeError):
            _detect_framework(None)
