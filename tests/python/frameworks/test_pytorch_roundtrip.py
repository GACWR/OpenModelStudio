"""End-to-end roundtrip: PyTorch model -> detect -> serialize -> generate -> exec."""

import base64
import pytest
from conftest import MockModelContext
from openmodelstudio.client import _detect_framework, _serialize_model, _generate_source_code

pytestmark = pytest.mark.skipif(
    not pytest.importorskip("torch", reason="torch not installed"),
    reason="torch not installed",
)


class TestPytorchRoundtrip:
    """Full pipeline: detect -> serialize -> generate code -> execute in MockModelContext."""

    def _generate_code(self, pytorch_model):
        framework = _detect_framework(pytorch_model)
        assert framework == "pytorch"
        model_bytes = _serialize_model(pytorch_model, framework)
        model_b64 = base64.b64encode(model_bytes).decode()
        source = _generate_source_code(framework, model_b64)
        assert source, "Source code should not be empty"
        return source

    def test_pytorch_roundtrip_train(self, pytorch_model):
        source = self._generate_code(pytorch_model)
        ctx = MockModelContext(hyperparameters={"epochs": 2, "batch_size": 8})

        # Execute the generated train() function
        ns = {}
        exec(source, ns)
        ns["train"](ctx)

        # Verify metrics were logged
        metric_names = [m[0] for m in ctx._logged_metrics]
        assert "loss" in metric_names
        assert "accuracy" in metric_names
        assert "progress" in metric_names

    def test_pytorch_roundtrip_infer(self, pytorch_model):
        source = self._generate_code(pytorch_model)
        # The SimpleNet has input_size=4, so pass 4 features
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
        preds = ctx._output["predictions"]
        assert isinstance(preds, list)
        assert len(preds) == 1  # one sample
