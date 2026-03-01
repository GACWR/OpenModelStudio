"""End-to-end roundtrip: sklearn model -> detect -> serialize -> generate -> exec."""

import base64
import pytest
from conftest import MockModelContext
from openmodelstudio.client import _detect_framework, _serialize_model, _generate_source_code

pytestmark = pytest.mark.skipif(
    not pytest.importorskip("sklearn", reason="sklearn not installed"),
    reason="sklearn not installed",
)


class TestSklearnRoundtrip:
    """Full pipeline: detect -> serialize -> generate code -> execute in MockModelContext."""

    def _generate_code(self, sklearn_model):
        framework = _detect_framework(sklearn_model)
        assert framework == "sklearn"
        model_bytes = _serialize_model(sklearn_model, framework)
        model_b64 = base64.b64encode(model_bytes).decode()
        source = _generate_source_code(framework, model_b64)
        assert source, "Source code should not be empty"
        return source

    def test_sklearn_roundtrip_train(self, sklearn_model):
        source = self._generate_code(sklearn_model)
        ctx = MockModelContext(hyperparameters={"n_samples": 100, "n_features": 4})

        # Execute the generated train() function
        ns = {}
        exec(source, ns)
        ns["train"](ctx)

        # Verify metrics were logged
        metric_names = [m[0] for m in ctx._logged_metrics]
        assert "accuracy" in metric_names
        assert "loss" in metric_names
        assert "progress" in metric_names

    def test_sklearn_roundtrip_infer(self, sklearn_model):
        source = self._generate_code(sklearn_model)
        ctx = MockModelContext(
            hyperparameters={
                "input_data": {"features": [[1.0, 2.0, 3.0, 4.0]]}
            }
        )

        # Execute the generated infer() function
        ns = {}
        exec(source, ns)
        ns["infer"](ctx)

        # Verify output was set
        assert ctx._output is not None
        assert "predictions" in ctx._output
