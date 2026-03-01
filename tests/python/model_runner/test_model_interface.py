"""Tests for model_interface.ModelInterface ABC."""

import pytest
from model_interface import ModelInterface


class TestModelInterface:
    """Verify that ModelInterface enforces the abstract contract."""

    def test_model_interface_is_abstract(self):
        """Cannot instantiate ModelInterface directly."""
        with pytest.raises(TypeError):
            ModelInterface()

    def test_subclass_must_implement_train(self):
        """A subclass missing train() cannot be instantiated."""

        class MissingTrain(ModelInterface):
            def infer(self, ctx):
                pass

        with pytest.raises(TypeError):
            MissingTrain()

    def test_subclass_must_implement_infer(self):
        """A subclass missing infer() cannot be instantiated."""

        class MissingInfer(ModelInterface):
            def train(self, ctx):
                pass

        with pytest.raises(TypeError):
            MissingInfer()

    def test_valid_subclass(self):
        """A subclass implementing both methods can be instantiated."""

        class ValidModel(ModelInterface):
            def train(self, ctx):
                pass

            def infer(self, ctx):
                pass

        instance = ValidModel()
        assert isinstance(instance, ModelInterface)
        assert callable(instance.train)
        assert callable(instance.infer)
