"""Tests for runner.load_model_from_source()."""

import pytest
from unittest.mock import MagicMock
from runner import load_model_from_source
from model_interface import ModelInterface


# Source code with a ModelInterface subclass
SRC_INTERFACE_SUBCLASS = """\
from model_interface import ModelInterface

class MyModel(ModelInterface):
    def train(self, ctx):
        ctx.log_metric("trained", 1.0)

    def infer(self, ctx):
        ctx.set_output({"result": "ok"})
"""

# Source code with bare train/infer functions
SRC_TRAIN_INFER = """\
def train(ctx):
    ctx.log_metric("loss", 0.1)

def infer(ctx):
    ctx.set_output({"pred": 42})
"""

# Source code with only train()
SRC_TRAIN_ONLY = """\
def train(ctx):
    ctx.log_metric("progress", 100)
"""

# Source code with no train/infer (standalone script)
SRC_STANDALONE = """\
x = 1 + 1
"""


class TestLoadModelFromSource:
    """Verify dynamic model loading from source strings."""

    def test_load_model_interface_subclass(self):
        model = load_model_from_source(SRC_INTERFACE_SUBCLASS)
        assert model is not None
        assert isinstance(model, ModelInterface)

    def test_load_train_infer_functions(self):
        model = load_model_from_source(SRC_TRAIN_INFER)
        assert model is not None
        assert isinstance(model, ModelInterface)

    def test_load_train_only(self):
        model = load_model_from_source(SRC_TRAIN_ONLY)
        assert model is not None
        assert isinstance(model, ModelInterface)

    def test_load_standalone_script(self):
        model = load_model_from_source(SRC_STANDALONE)
        assert model is None

    def test_loaded_model_train_callable(self):
        model = load_model_from_source(SRC_TRAIN_INFER)
        assert model is not None
        ctx = MagicMock()
        # Should not raise
        model.train(ctx)
        ctx.log_metric.assert_called_once_with("loss", 0.1)

    def test_loaded_model_infer_callable(self):
        model = load_model_from_source(SRC_TRAIN_INFER)
        assert model is not None
        ctx = MagicMock()
        model.infer(ctx)
        ctx.set_output.assert_called_once_with({"pred": 42})
