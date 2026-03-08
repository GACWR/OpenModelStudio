"""OpenModelStudio Registry Client.

Provides functions to search, list, install, and manage models
from the public OpenModel Registry or a custom registry.
"""

import json
import os
import shutil
from pathlib import Path

import requests

from .config import get_registry_url, get_models_dir


def _fetch_index(registry_url: str = None) -> dict:
    url = registry_url or get_registry_url()
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def registry_search(query: str, category: str = None, framework: str = None,
                     registry_url: str = None) -> list:
    """Search the model registry.

    Examples::

        results = oms.registry_search("classification")
        results = oms.registry_search("cnn", framework="pytorch")
        results = oms.registry_search("", category="nlp")

    Args:
        query: Search query (matches name, description, tags)
        category: Filter by category
        framework: Filter by framework
        registry_url: Override default registry URL

    Returns:
        List of matching model metadata dicts
    """
    index = _fetch_index(registry_url)
    models = index.get("models", [])
    query_lower = query.lower()

    results = []
    for m in models:
        # Category filter
        if category and m.get("category", "").lower() != category.lower():
            continue
        # Framework filter
        if framework and m.get("framework", "").lower() != framework.lower():
            continue
        # Text search
        if query_lower:
            searchable = " ".join([
                m.get("name", ""),
                m.get("description", ""),
                " ".join(m.get("tags", [])),
                m.get("author", ""),
            ]).lower()
            if query_lower not in searchable:
                continue
        results.append(m)

    return results


def registry_list(registry_url: str = None) -> list:
    """List all models in the registry.

    Returns:
        List of model metadata dicts
    """
    index = _fetch_index(registry_url)
    return index.get("models", [])


def registry_info(name: str, registry_url: str = None) -> dict:
    """Get detailed info about a specific model in the registry.

    Args:
        name: Model name (e.g. "titanic-rf")

    Returns:
        Model metadata dict

    Raises:
        ValueError: If model not found
    """
    index = _fetch_index(registry_url)
    for m in index.get("models", []):
        if m["name"] == name:
            return m
    raise ValueError(f"Model '{name}' not found in registry")


def registry_install(name: str, registry_url: str = None, models_dir: str = None,
                     force: bool = False, project_id: str = None,
                     api_url: str = None, token: str = None) -> Path:
    """Install a model from the registry.

    Downloads the model files to the local models directory and registers
    the model with the platform API (if reachable).

    Examples::

        path = oms.registry_install("titanic-rf")
        path = oms.registry_install("mnist-cnn", force=True)

    Args:
        name: Model name (e.g. "titanic-rf")
        registry_url: Override default registry URL
        models_dir: Override default models directory
        force: Overwrite existing installation
        project_id: Optional project UUID to associate the model with
        api_url: Override API URL (defaults to env/config)
        token: Override auth token (defaults to env/config)

    Returns:
        Path to the installed model directory
    """
    info = registry_info(name, registry_url=registry_url)
    raw_prefix = info.get("_registry", {}).get("raw_url_prefix", "")
    if not raw_prefix:
        reg_path = info.get("_registry", {}).get("path", f"models/{name}")
        url = registry_url or get_registry_url()
        base = url.rsplit("/registry/", 1)[0]
        raw_prefix = f"{base}/{reg_path}"

    dest = Path(models_dir) if models_dir else get_models_dir()
    model_dir = dest / name
    if model_dir.exists() and not force:
        return model_dir

    model_dir.mkdir(parents=True, exist_ok=True)

    # Download each file listed in the manifest
    files = info.get("files", [])
    if not files:
        files = ["model.py"]

    for fname in files:
        file_url = f"{raw_prefix}/{fname}"
        resp = requests.get(file_url, timeout=60)
        resp.raise_for_status()
        (model_dir / fname).write_bytes(resp.content)

    # Write manifest locally
    (model_dir / "model.json").write_text(json.dumps(info, indent=2))

    # Register with the platform API so the model appears on the Models page
    _api_url = api_url or os.environ.get("OPENMODELSTUDIO_API_URL") or _load_api_url()
    _token = token or os.environ.get("OPENMODELSTUDIO_TOKEN")

    if _api_url:
        try:
            main_file = files[0]
            source_code = (model_dir / main_file).read_text()

            headers = {"Content-Type": "application/json"}
            if _token:
                headers["Authorization"] = f"Bearer {_token}"

            body = {
                "name": name,
                "framework": info.get("framework", "pytorch"),
                "description": info.get("description"),
                "source_code": source_code,
                "registry_name": name,
            }
            if project_id:
                body["project_id"] = project_id

            resp = requests.post(
                f"{_api_url}/sdk/register-model",
                json=body, headers=headers, timeout=30,
            )
            if resp.ok:
                print(f"  Registered '{name}' with platform")
            else:
                print(f"  Warning: Could not register with platform ({resp.status_code})")
        except Exception as e:
            print(f"  Warning: Could not register with platform: {e}")

    return model_dir


def _load_api_url() -> str:
    """Try to load api_url from the config file."""
    try:
        from .config import get_config
        return get_config().get("api_url", "")
    except Exception:
        return ""


def registry_uninstall(name: str, models_dir: str = None,
                       api_url: str = None, token: str = None) -> bool:
    """Uninstall a locally installed model.

    Removes local files and unregisters from the platform API so the
    dashboard reflects the change.

    Args:
        name: Model name
        models_dir: Override models directory
        api_url: Override API URL
        token: Override auth token

    Returns:
        True if model was removed, False if it wasn't installed
    """
    removed = False
    dest = Path(models_dir) if models_dir else get_models_dir()
    model_dir = dest / name
    if model_dir.exists():
        shutil.rmtree(model_dir)
        removed = True

    # Also unregister from platform API
    _api_url = api_url or os.environ.get("OPENMODELSTUDIO_API_URL") or _load_api_url()
    _token = token or os.environ.get("OPENMODELSTUDIO_TOKEN")
    if _api_url:
        try:
            headers = {"Content-Type": "application/json"}
            if _token:
                headers["Authorization"] = f"Bearer {_token}"
            resp = requests.post(
                f"{_api_url}/models/registry-uninstall",
                json={"name": name}, headers=headers, timeout=10,
            )
            if resp.ok:
                print(f"  Unregistered '{name}' from platform")
                removed = True
        except Exception:
            pass  # best-effort

    return removed


def list_installed(models_dir: str = None) -> list:
    """List locally installed models.

    Returns:
        List of model metadata dicts for installed models
    """
    dest = Path(models_dir) if models_dir else get_models_dir()
    if not dest.exists():
        return []

    installed = []
    for d in sorted(dest.iterdir()):
        if not d.is_dir():
            continue
        manifest = d / "model.json"
        if manifest.exists():
            try:
                data = json.loads(manifest.read_text())
                data["_installed_path"] = str(d)
                installed.append(data)
            except (json.JSONDecodeError, OSError):
                continue
    return installed


def set_registry(url: str):
    """Set the default registry URL.

    Persists across sessions. Can also be set via the
    OPENMODELSTUDIO_REGISTRY_URL environment variable.

    Args:
        url: Full URL to registry/index.json
    """
    from .config import set_registry_url
    set_registry_url(url)
