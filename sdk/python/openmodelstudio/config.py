"""Configuration management for OpenModelStudio SDK.

Handles user preferences including custom registry URLs,
model install paths, and persistent settings.
"""

import json
import os
from pathlib import Path

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
