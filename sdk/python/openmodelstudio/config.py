"""Configuration management for OpenModelStudio SDK.

Handles user preferences including custom registry URLs,
model install paths, and persistent settings.
"""

import json
import os
from pathlib import Path
from typing import Optional

DEFAULT_REGISTRY_URL = (
    "https://raw.githubusercontent.com/GACWR/open-model-registry/main/registry/index.json"
)

_CONFIG_DIR = Path.home() / ".openmodelstudio"
_CONFIG_FILE = _CONFIG_DIR / "config.json"


def _load_config() -> dict:
    if _CONFIG_FILE.exists():
        try:
            return json.loads(_CONFIG_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_config(cfg: dict):
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def get_registry_url() -> str:
    env = os.environ.get("OPENMODELSTUDIO_REGISTRY_URL")
    if env:
        return env
    cfg = _load_config()
    return cfg.get("registry_url", DEFAULT_REGISTRY_URL)


def set_registry_url(url: str):
    cfg = _load_config()
    cfg["registry_url"] = url
    _save_config(cfg)


def get_models_dir() -> Path:
    env = os.environ.get("OPENMODELSTUDIO_MODELS_DIR")
    if env:
        return Path(env)
    cfg = _load_config()
    default = str(Path.home() / ".openmodelstudio" / "models")
    return Path(cfg.get("models_dir", default))


def set_models_dir(path: str):
    cfg = _load_config()
    cfg["models_dir"] = str(path)
    _save_config(cfg)


def get_config() -> dict:
    cfg = _load_config()
    return {
        "registry_url": get_registry_url(),
        "models_dir": str(get_models_dir()),
        "api_url": os.environ.get("OPENMODELSTUDIO_API_URL", cfg.get("api_url", "")),
    }


# ── Project root detection ────────────────────────────────────────────

# Marker files that identify an OpenModelStudio project root.
# We walk up from cwd looking for any of these.
_PROJECT_MARKERS = (
    ".openmodelstudio",         # dedicated project config directory
    "openmodelstudio.json",     # project config file
    "deploy/Dockerfile.workspace",  # standard OMS project layout
)


def find_project_root(start: str = None) -> Optional[Path]:
    """Walk up from *start* (default: cwd) looking for a project root.

    Returns the Path if found, else None.
    """
    current = Path(start or os.getcwd()).resolve()
    while True:
        for marker in _PROJECT_MARKERS:
            if (current / marker).exists():
                return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def require_project_root(start: str = None) -> Path:
    """Like find_project_root but raises if not found."""
    root = find_project_root(start)
    if root is None:
        raise SystemExit(
            "Error: Not inside an OpenModelStudio project.\n"
            "Run this command from the root of your project, or create a "
            "'.openmodelstudio/' directory to mark the project root."
        )
    return root


def get_project_models_dir(start: str = None) -> Path:
    """Return the project-local models directory (<root>/.openmodelstudio/models/).

    Falls back to the global models dir if no project root is found.
    """
    root = find_project_root(start)
    if root is not None:
        d = root / ".openmodelstudio" / "models"
        d.mkdir(parents=True, exist_ok=True)
        return d
    return get_models_dir()
