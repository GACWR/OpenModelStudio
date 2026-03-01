"""End-to-end roundtrip: TensorFlow/Keras model -> detect -> serialize -> generate -> exec."""

import base64
import pytest
from conftest import MockModelContext
from openmodelstudio.client import _detect_framework, _serialize_model, _generate_source_code

# Skip entire module if tensorflow is not available
tf = pytest.importorskip("tensorflow")
pytestmark = pytest.mark.skipif(
    not tf,
    reason="TensorFlow not installed",
)


class TestTensorflowRoundtrip:
    """Full pipeline: detect -> serialize -> generate code -> execute in MockModelContext."""

    def _generate_code(self, tf_model):
        framework = _detect_framework(tf_model)
        assert framework == "tensorflow"
        model_bytes = _serialize_model(tf_model, framework)
        model_b64 = base64.b64encode(model_bytes).decode()
        source = _generate_source_code(framework, model_b64)
        assert source, "Source code should not be empty"
        return source

    def test_tensorflow_roundtrip_train(self, tf_model):
        source = self._generate_code(tf_model)
        ctx = MockModelContext(hyperparameters={"epochs": 2, "n_samples": 50, "batch_size": 16})

        # Execute the generated train() function
        ns = {}
        exec(source, ns)
        ns["train"](ctx)

        # Verify metrics were logged
        metric_names = [m[0] for m in ctx._logged_metrics]
        assert "loss" in metric_names
        assert "progress" in metric_names

    def test_tensorflow_roundtrip_infer(self, tf_model):
        source = self._generate_code(tf_model)
        ctx = MockModelContext(
            hyperparameters={
                "input_data": {"features": [[1.0, 2.0, 3.0, 4.0]]}
            }
        )

        # Execute the generated infer() function
        ns = {}
        exec(source, ns)
        ns["infer"](ctx)

        # Verify output was set with predictions
        assert ctx._output is not None
        assert "predictions" in ctx._output
