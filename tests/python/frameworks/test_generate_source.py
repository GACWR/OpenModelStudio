"""Tests for _generate_source_code() in openmodelstudio.client."""

import pytest
from openmodelstudio.client import _generate_source_code


DUMMY_B64 = "dGVzdA=="  # base64("test")


class TestGenerateSourceCode:
    """Verify generated source code for each framework."""

    # ── sklearn ──────────────────────────────────────────────────────

    def test_generate_sklearn_compiles(self):
        src = _generate_source_code("sklearn", DUMMY_B64)
        # Should not raise
        compile(src, "<sklearn_generated>", "exec")

    def test_generate_sklearn_has_train_infer(self):
        src = _generate_source_code("sklearn", DUMMY_B64)
        assert "def train(ctx):" in src
        assert "def infer(ctx):" in src

    def test_generate_sklearn_embeds_model(self):
        custom_b64 = "Y3VzdG9tX21vZGVs"
        src = _generate_source_code("sklearn", custom_b64)
        assert "_MODEL_B64" in src
        assert custom_b64 in src

    # ── pytorch ──────────────────────────────────────────────────────

    def test_generate_pytorch_compiles(self):
        src = _generate_source_code("pytorch", DUMMY_B64)
        compile(src, "<pytorch_generated>", "exec")

    def test_generate_pytorch_has_train_infer(self):
        src = _generate_source_code("pytorch", DUMMY_B64)
        assert "def train(ctx):" in src
        assert "def infer(ctx):" in src

    # ── tensorflow ───────────────────────────────────────────────────

    def test_generate_tensorflow_compiles(self):
        src = _generate_source_code("tensorflow", DUMMY_B64)
        compile(src, "<tensorflow_generated>", "exec")

    def test_generate_tensorflow_has_train_infer(self):
        src = _generate_source_code("tensorflow", DUMMY_B64)
        assert "def train(ctx):" in src
        assert "def infer(ctx):" in src

    # ── unknown ──────────────────────────────────────────────────────

    def test_generate_unknown_returns_empty(self):
        src = _generate_source_code("unknown", DUMMY_B64)
        assert src == ""
