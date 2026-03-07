"""Tests for the OpenModelStudio CLI commands and project root detection."""

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
import responses

from openmodelstudio.config import (
    find_project_root,
    require_project_root,
    get_project_models_dir,
    DEFAULT_REGISTRY_URL,
)
from openmodelstudio.cli import main


# ── Sample registry index ──────────────────────────────────────────

SAMPLE_INDEX = {
    "models": [
        {
            "name": "titanic-rf",
            "version": "1.0.0",
            "framework": "sklearn",
            "category": "classification",
            "author": "openmodelstudio",
            "description": "Random Forest classifier for Titanic survival prediction.",
            "tags": ["classification", "tabular", "beginner"],
            "license": "MIT",
            "dependencies": ["scikit-learn>=1.0", "pandas>=1.5"],
            "homepage": "https://github.com/GACWR/open-model-registry",
            "files": ["model.py"],
            "_registry": {
                "path": "models/titanic-rf",
                "raw_url_prefix": "https://raw.githubusercontent.com/GACWR/open-model-registry/main/models/titanic-rf",
            },
        },
        {
            "name": "mnist-cnn",
            "version": "1.0.0",
            "framework": "pytorch",
            "category": "computer-vision",
            "author": "openmodelstudio",
            "description": "Convolutional Neural Network for MNIST digit classification.",
            "tags": ["image-classification", "cnn", "mnist"],
            "license": "MIT",
            "dependencies": ["torch>=2.0", "torchvision>=0.15"],
            "homepage": "https://github.com/GACWR/open-model-registry",
            "files": ["model.py"],
            "_registry": {
                "path": "models/mnist-cnn",
                "raw_url_prefix": "https://raw.githubusercontent.com/GACWR/open-model-registry/main/models/mnist-cnn",
            },
        },
    ],
}

SAMPLE_MODEL_CODE = """
def train(ctx):
    print("training")

def infer(ctx):
    print("inferring")
"""


# ── Project root detection ─────────────────────────────────────────


class TestFindProjectRoot:
    """Tests for find_project_root() and require_project_root()."""

    def test_finds_openmodelstudio_dir(self, tmp_path):
        (tmp_path / ".openmodelstudio").mkdir()
        sub = tmp_path / "a" / "b" / "c"
        sub.mkdir(parents=True)
        assert find_project_root(str(sub)) == tmp_path

    def test_finds_openmodelstudio_json(self, tmp_path):
        (tmp_path / "openmodelstudio.json").write_text("{}")
        assert find_project_root(str(tmp_path)) == tmp_path

    def test_finds_deploy_dockerfile_workspace(self, tmp_path):
        (tmp_path / "deploy").mkdir()
        (tmp_path / "deploy" / "Dockerfile.workspace").write_text("")
        sub = tmp_path / "sdk" / "python"
        sub.mkdir(parents=True)
        assert find_project_root(str(sub)) == tmp_path

    def test_returns_none_when_not_in_project(self, tmp_path):
        sub = tmp_path / "random" / "dir"
        sub.mkdir(parents=True)
        assert find_project_root(str(sub)) is None

    def test_require_project_root_raises(self, tmp_path):
        sub = tmp_path / "not_a_project"
        sub.mkdir(parents=True)
        with pytest.raises(SystemExit, match="Not inside an OpenModelStudio project"):
            require_project_root(str(sub))

    def test_require_project_root_succeeds(self, tmp_path):
        (tmp_path / ".openmodelstudio").mkdir()
        result = require_project_root(str(tmp_path))
        assert result == tmp_path

    def test_get_project_models_dir_in_project(self, tmp_path):
        (tmp_path / ".openmodelstudio").mkdir()
        d = get_project_models_dir(str(tmp_path))
        assert d == tmp_path / ".openmodelstudio" / "models"
        assert d.exists()

    def test_get_project_models_dir_fallback(self, tmp_path):
        sub = tmp_path / "not_project"
        sub.mkdir()
        d = get_project_models_dir(str(sub))
        # Falls back to global models dir
        assert "models" in str(d)


# ── Registry functions ─────────────────────────────────────────────


class TestRegistrySearch:
    """Tests for registry_search()."""

    @responses.activate
    def test_search_by_query(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_search

        results = registry_search("titanic")
        assert len(results) == 1
        assert results[0]["name"] == "titanic-rf"

    @responses.activate
    def test_search_by_framework(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_search

        results = registry_search("", framework="pytorch")
        assert len(results) == 1
        assert results[0]["name"] == "mnist-cnn"

    @responses.activate
    def test_search_by_category(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_search

        results = registry_search("", category="classification")
        assert len(results) == 1
        assert results[0]["name"] == "titanic-rf"

    @responses.activate
    def test_search_no_results(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_search

        results = registry_search("nonexistent-model-xyz")
        assert len(results) == 0

    @responses.activate
    def test_search_empty_query_returns_all(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_search

        results = registry_search("")
        assert len(results) == 2


class TestRegistryList:
    """Tests for registry_list()."""

    @responses.activate
    def test_list_all(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_list

        models = registry_list()
        assert len(models) == 2


class TestRegistryInfo:
    """Tests for registry_info()."""

    @responses.activate
    def test_info_found(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_info

        info = registry_info("titanic-rf")
        assert info["name"] == "titanic-rf"
        assert info["framework"] == "sklearn"

    @responses.activate
    def test_info_not_found(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        from openmodelstudio.registry import registry_info

        with pytest.raises(ValueError, match="not found"):
            registry_info("nonexistent-model")


# ── Install / Uninstall ───────────────────────────────────────────


class TestRegistryInstall:
    """Tests for registry_install() and registry_uninstall()."""

    @responses.activate
    def test_install_model(self, tmp_path):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        raw_url = "https://raw.githubusercontent.com/GACWR/open-model-registry/main/models/titanic-rf/model.py"
        responses.add(responses.GET, raw_url, body=SAMPLE_MODEL_CODE)

        from openmodelstudio.registry import registry_install

        path = registry_install("titanic-rf", models_dir=str(tmp_path))
        assert path == tmp_path / "titanic-rf"
        assert (path / "model.py").exists()
        assert (path / "model.json").exists()
        assert "train(ctx)" in (path / "model.py").read_text()

    @responses.activate
    def test_install_skip_existing(self, tmp_path):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        model_dir = tmp_path / "titanic-rf"
        model_dir.mkdir()

        from openmodelstudio.registry import registry_install

        # Should return existing dir without downloading
        path = registry_install("titanic-rf", models_dir=str(tmp_path))
        assert path == model_dir
        assert not (model_dir / "model.py").exists()  # no download occurred

    @responses.activate
    def test_install_force_reinstall(self, tmp_path):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        raw_url = "https://raw.githubusercontent.com/GACWR/open-model-registry/main/models/titanic-rf/model.py"
        responses.add(responses.GET, raw_url, body=SAMPLE_MODEL_CODE)

        model_dir = tmp_path / "titanic-rf"
        model_dir.mkdir()

        from openmodelstudio.registry import registry_install

        path = registry_install("titanic-rf", models_dir=str(tmp_path), force=True)
        assert (path / "model.py").exists()  # download occurred

    def test_uninstall_model(self, tmp_path):
        model_dir = tmp_path / "titanic-rf"
        model_dir.mkdir()
        (model_dir / "model.py").write_text("code")

        from openmodelstudio.registry import registry_uninstall

        assert registry_uninstall("titanic-rf", models_dir=str(tmp_path)) is True
        assert not model_dir.exists()

    def test_uninstall_nonexistent(self, tmp_path):
        from openmodelstudio.registry import registry_uninstall

        assert registry_uninstall("nonexistent", models_dir=str(tmp_path)) is False


class TestListInstalled:
    """Tests for list_installed()."""

    def test_list_empty(self, tmp_path):
        from openmodelstudio.registry import list_installed

        installed = list_installed(models_dir=str(tmp_path))
        assert installed == []

    def test_list_with_models(self, tmp_path):
        model_dir = tmp_path / "titanic-rf"
        model_dir.mkdir()
        (model_dir / "model.json").write_text(json.dumps({
            "name": "titanic-rf",
            "version": "1.0.0",
            "framework": "sklearn",
        }))

        from openmodelstudio.registry import list_installed

        installed = list_installed(models_dir=str(tmp_path))
        assert len(installed) == 1
        assert installed[0]["name"] == "titanic-rf"
        assert installed[0]["_installed_path"] == str(model_dir)

    def test_list_ignores_non_dirs(self, tmp_path):
        (tmp_path / "some_file.txt").write_text("not a model")

        from openmodelstudio.registry import list_installed

        installed = list_installed(models_dir=str(tmp_path))
        assert installed == []

    def test_list_ignores_dirs_without_manifest(self, tmp_path):
        (tmp_path / "broken-model").mkdir()

        from openmodelstudio.registry import list_installed

        installed = list_installed(models_dir=str(tmp_path))
        assert installed == []


# ── CLI command tests ──────────────────────────────────────────────


class TestCLIInstall:
    """Tests for 'openmodelstudio install' command."""

    @responses.activate
    def test_install_in_project(self, tmp_path, capsys):
        (tmp_path / ".openmodelstudio").mkdir()
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)
        raw_url = "https://raw.githubusercontent.com/GACWR/open-model-registry/main/models/titanic-rf/model.py"
        responses.add(responses.GET, raw_url, body=SAMPLE_MODEL_CODE)

        with patch("os.getcwd", return_value=str(tmp_path)):
            with patch("sys.argv", ["openmodelstudio", "install", "titanic-rf"]):
                main()

        captured = capsys.readouterr()
        assert "Installing" in captured.out
        assert "Installed to" in captured.out
        assert (tmp_path / ".openmodelstudio" / "models" / "titanic-rf" / "model.py").exists()

    def test_install_outside_project_fails(self, tmp_path):
        sub = tmp_path / "not_project"
        sub.mkdir()

        with patch("os.getcwd", return_value=str(sub)):
            with patch("sys.argv", ["openmodelstudio", "install", "some-model"]):
                with pytest.raises(SystemExit):
                    main()


class TestCLIUninstall:
    """Tests for 'openmodelstudio uninstall' command."""

    def test_uninstall_in_project(self, tmp_path, capsys):
        (tmp_path / ".openmodelstudio" / "models" / "titanic-rf").mkdir(parents=True)
        (tmp_path / ".openmodelstudio" / "models" / "titanic-rf" / "model.py").write_text("code")

        with patch("os.getcwd", return_value=str(tmp_path)):
            with patch("sys.argv", ["openmodelstudio", "uninstall", "titanic-rf"]):
                main()

        captured = capsys.readouterr()
        assert "Uninstalled" in captured.out
        assert not (tmp_path / ".openmodelstudio" / "models" / "titanic-rf").exists()

    def test_uninstall_nonexistent_model(self, tmp_path):
        (tmp_path / ".openmodelstudio" / "models").mkdir(parents=True)

        with patch("os.getcwd", return_value=str(tmp_path)):
            with patch("sys.argv", ["openmodelstudio", "uninstall", "nonexistent"]):
                with pytest.raises(SystemExit):
                    main()

    def test_uninstall_outside_project_fails(self, tmp_path):
        sub = tmp_path / "not_project"
        sub.mkdir()

        with patch("os.getcwd", return_value=str(sub)):
            with patch("sys.argv", ["openmodelstudio", "uninstall", "some-model"]):
                with pytest.raises(SystemExit):
                    main()


class TestCLISearch:
    """Tests for 'openmodelstudio search' command."""

    @responses.activate
    def test_search_outputs_table(self, capsys):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)

        with patch("sys.argv", ["openmodelstudio", "search", "classification"]):
            main()

        captured = capsys.readouterr()
        assert "titanic-rf" in captured.out
        assert "sklearn" in captured.out

    @responses.activate
    def test_search_no_results(self, capsys):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)

        with patch("sys.argv", ["openmodelstudio", "search", "nonexistent-xyz"]):
            main()

        captured = capsys.readouterr()
        assert "No models found" in captured.out

    @responses.activate
    def test_search_with_framework_filter(self, capsys):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)

        with patch("sys.argv", ["openmodelstudio", "search", "", "--framework", "pytorch"]):
            main()

        captured = capsys.readouterr()
        assert "mnist-cnn" in captured.out
        assert "titanic-rf" not in captured.out


class TestCLIList:
    """Tests for 'openmodelstudio list' command."""

    def test_list_empty(self, tmp_path, capsys):
        (tmp_path / ".openmodelstudio" / "models").mkdir(parents=True)

        with patch("os.getcwd", return_value=str(tmp_path)):
            with patch("sys.argv", ["openmodelstudio", "list"]):
                main()

        captured = capsys.readouterr()
        assert "No models installed" in captured.out

    def test_list_with_models(self, tmp_path, capsys):
        models_dir = tmp_path / ".openmodelstudio" / "models"
        model_dir = models_dir / "titanic-rf"
        model_dir.mkdir(parents=True)
        (model_dir / "model.json").write_text(json.dumps({
            "name": "titanic-rf",
            "version": "1.0.0",
            "framework": "sklearn",
        }))

        with patch("os.getcwd", return_value=str(tmp_path)):
            with patch("sys.argv", ["openmodelstudio", "list"]):
                main()

        captured = capsys.readouterr()
        assert "titanic-rf" in captured.out
        assert "sklearn" in captured.out


class TestCLIRegistry:
    """Tests for 'openmodelstudio registry' command."""

    @responses.activate
    def test_registry_lists_all(self, capsys):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)

        with patch("sys.argv", ["openmodelstudio", "registry"]):
            main()

        captured = capsys.readouterr()
        assert "titanic-rf" in captured.out
        assert "mnist-cnn" in captured.out


class TestCLIInfo:
    """Tests for 'openmodelstudio info' command."""

    @responses.activate
    def test_info_displays_details(self, capsys):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)

        with patch("sys.argv", ["openmodelstudio", "info", "titanic-rf"]):
            main()

        captured = capsys.readouterr()
        assert "Name:" in captured.out
        assert "titanic-rf" in captured.out
        assert "sklearn" in captured.out
        assert "MIT" in captured.out

    @responses.activate
    def test_info_not_found(self):
        responses.add(responses.GET, DEFAULT_REGISTRY_URL, json=SAMPLE_INDEX)

        with patch("sys.argv", ["openmodelstudio", "info", "nonexistent"]):
            with pytest.raises(SystemExit):
                main()


class TestCLIConfig:
    """Tests for 'openmodelstudio config' command."""

    def test_config_show(self, capsys):
        with patch("sys.argv", ["openmodelstudio", "config"]):
            main()

        captured = capsys.readouterr()
        assert "registry_url:" in captured.out
        assert "models_dir:" in captured.out

    def test_config_set_registry_url(self, tmp_path, capsys):
        config_dir = tmp_path / ".openmodelstudio"
        config_dir.mkdir()
        config_file = config_dir / "config.json"

        with patch("openmodelstudio.config._CONFIG_DIR", config_dir), \
             patch("openmodelstudio.config._CONFIG_FILE", config_file):
            with patch("sys.argv", ["openmodelstudio", "config", "set", "registry_url", "https://example.com/index.json"]):
                main()

        captured = capsys.readouterr()
        assert "Set registry_url" in captured.out

    def test_config_set_invalid_key(self):
        with patch("sys.argv", ["openmodelstudio", "config", "set", "bad_key", "value"]):
            with pytest.raises(SystemExit):
                main()


class TestCLINoCommand:
    """Test CLI with no command shows help."""

    def test_no_command_shows_help(self):
        with patch("sys.argv", ["openmodelstudio"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 0
