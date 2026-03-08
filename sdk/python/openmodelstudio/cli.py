"""OpenModelStudio CLI — install, search, and manage models from the command line.

Usage:
    openmodelstudio install <name>       Install a model from the registry
    openmodelstudio uninstall <name>     Remove an installed model
    openmodelstudio search <query>       Search the model registry
    openmodelstudio list                 List installed models
    openmodelstudio registry             List all models in the registry
    openmodelstudio info <name>          Show details about a registry model
    openmodelstudio config               Show current configuration
    openmodelstudio config set <key> <value>  Set a configuration value

Commands that modify the local project (install, uninstall, list) must be run
from within an OpenModelStudio project directory.  A project is identified by
the presence of a '.openmodelstudio/' directory, 'openmodelstudio.json', or
'deploy/Dockerfile.workspace' in an ancestor directory.
"""

import argparse
import sys


def _print_table(rows: list, headers: list):
    """Print a simple aligned table."""
    if not rows:
        return
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))

    fmt = "  ".join(f"{{:<{w}}}" for w in widths)
    print(fmt.format(*headers))
    print(fmt.format(*["-" * w for w in widths]))
    for row in rows:
        print(fmt.format(*[str(c) for c in row]))


def cmd_install(args):
    from .config import require_project_root, get_project_models_dir, get_config
    from .registry import registry_install

    require_project_root()
    models_dir = get_project_models_dir()
    cfg = get_config()
    name = args.name
    print(f"Installing '{name}' from registry...")
    try:
        path = registry_install(
            name,
            force=args.force,
            models_dir=str(models_dir),
            project_id=getattr(args, "project", None),
            api_url=cfg.get("api_url"),
        )
        print(f"Installed to {path}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_uninstall(args):
    from .config import require_project_root, get_project_models_dir, get_config
    from .registry import registry_uninstall

    require_project_root()
    models_dir = get_project_models_dir()
    cfg = get_config()
    if registry_uninstall(args.name, models_dir=str(models_dir),
                          api_url=cfg.get("api_url")):
        print(f"Uninstalled '{args.name}'")
    else:
        print(f"Model '{args.name}' is not installed")
        sys.exit(1)


def cmd_search(args):
    from .registry import registry_search
    query = " ".join(args.query) if args.query else ""
    results = registry_search(query, category=args.category, framework=args.framework)
    if not results:
        print("No models found matching your query.")
        return
    rows = []
    for m in results:
        rows.append([
            m["name"],
            m.get("version", "?"),
            m.get("framework", "?"),
            m.get("category", "?"),
            m.get("description", "")[:60],
        ])
    _print_table(rows, ["NAME", "VERSION", "FRAMEWORK", "CATEGORY", "DESCRIPTION"])


def cmd_list(args):
    from .config import find_project_root, get_project_models_dir, get_models_dir
    from .registry import list_installed

    root = find_project_root()
    if root is not None:
        models_dir = str(get_project_models_dir())
    else:
        models_dir = str(get_models_dir())

    installed = list_installed(models_dir=models_dir)
    if not installed:
        print("No models installed. Use 'openmodelstudio install <name>' to install one.")
        return
    rows = []
    for m in installed:
        rows.append([
            m["name"],
            m.get("version", "?"),
            m.get("framework", "?"),
            m.get("_installed_path", "?"),
        ])
    _print_table(rows, ["NAME", "VERSION", "FRAMEWORK", "PATH"])


def cmd_registry(args):
    from .registry import registry_list
    models = registry_list()
    if not models:
        print("Registry is empty or unreachable.")
        return
    rows = []
    for m in models:
        rows.append([
            m["name"],
            m.get("version", "?"),
            m.get("framework", "?"),
            m.get("category", "?"),
            m.get("author", "?"),
            m.get("description", "")[:50],
        ])
    _print_table(rows, ["NAME", "VERSION", "FRAMEWORK", "CATEGORY", "AUTHOR", "DESCRIPTION"])


def cmd_info(args):
    from .registry import registry_info
    try:
        info = registry_info(args.name)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    print(f"Name:        {info['name']}")
    print(f"Version:     {info.get('version', '?')}")
    print(f"Author:      {info.get('author', '?')}")
    print(f"Framework:   {info.get('framework', '?')}")
    print(f"Category:    {info.get('category', '?')}")
    print(f"License:     {info.get('license', '?')}")
    print(f"Description: {info.get('description', '')}")
    if info.get("tags"):
        print(f"Tags:        {', '.join(info['tags'])}")
    if info.get("dependencies"):
        print(f"Dependencies: {', '.join(info['dependencies'])}")
    if info.get("homepage"):
        print(f"Homepage:    {info['homepage']}")


def cmd_config(args):
    from .config import get_config, set_registry_url, set_models_dir

    if args.action == "set":
        key = args.key
        value = args.value
        if key == "registry_url":
            set_registry_url(value)
            print(f"Set registry_url = {value}")
        elif key == "models_dir":
            set_models_dir(value)
            print(f"Set models_dir = {value}")
        else:
            print(f"Unknown config key: {key}", file=sys.stderr)
            print("Valid keys: registry_url, models_dir")
            sys.exit(1)
    else:
        cfg = get_config()
        for k, v in cfg.items():
            print(f"{k}: {v}")


def main():
    parser = argparse.ArgumentParser(
        prog="openmodelstudio",
        description="OpenModelStudio — AI model platform CLI",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # install
    p_install = subparsers.add_parser("install", help="Install a model from the registry")
    p_install.add_argument("name", help="Model name (e.g. titanic-rf)")
    p_install.add_argument("--force", "-f", action="store_true", help="Overwrite existing")
    p_install.add_argument("--project", "-p", help="Project ID to install into")
    p_install.set_defaults(func=cmd_install)

    # uninstall
    p_uninstall = subparsers.add_parser("uninstall", help="Remove an installed model")
    p_uninstall.add_argument("name", help="Model name")
    p_uninstall.set_defaults(func=cmd_uninstall)

    # search
    p_search = subparsers.add_parser("search", help="Search the model registry")
    p_search.add_argument("query", nargs="*", help="Search terms")
    p_search.add_argument("--category", "-c", help="Filter by category")
    p_search.add_argument("--framework", "-fw", help="Filter by framework")
    p_search.set_defaults(func=cmd_search)

    # list
    p_list = subparsers.add_parser("list", help="List installed models")
    p_list.set_defaults(func=cmd_list)

    # registry
    p_registry = subparsers.add_parser("registry", help="List all models in the registry")
    p_registry.set_defaults(func=cmd_registry)

    # info
    p_info = subparsers.add_parser("info", help="Show details about a registry model")
    p_info.add_argument("name", help="Model name")
    p_info.set_defaults(func=cmd_info)

    # config
    p_config = subparsers.add_parser("config", help="Show or set configuration")
    p_config.add_argument("action", nargs="?", default="show", choices=["show", "set"])
    p_config.add_argument("key", nargs="?", help="Config key")
    p_config.add_argument("value", nargs="?", help="Config value")
    p_config.set_defaults(func=cmd_config)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)


if __name__ == "__main__":
    main()
