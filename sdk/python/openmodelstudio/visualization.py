"""OpenModelStudio Unified Visualization Abstraction.

Provides a framework-agnostic interface for creating visualizations
that can be saved, served in the dashboard, and composed into dashboards.

Supported backends:
    - matplotlib / seaborn / plotnine (ggplot2)  → static SVG/PNG
    - plotly / bokeh / altair                     → interactive JSON
    - datashader                                  → static PNG (large data)
    - networkx                                    → static SVG (graph layouts)
    - geopandas                                   → static SVG (maps)

Usage from a notebook::

    import openmodelstudio as oms

    # Quick static visualization
    viz = oms.create_visualization("loss-curve", "matplotlib",
        code=\"\"\"
        import matplotlib.pyplot as plt
        def render(ctx):
            plt.figure(figsize=(10, 6))
            plt.plot(ctx.data["epochs"], ctx.data["loss"])
            plt.title("Training Loss")
            plt.xlabel("Epoch")
            plt.ylabel("Loss")
            return plt.gcf()
        \"\"\",
        data={"epochs": [1,2,3], "loss": [0.9, 0.5, 0.2]}
    )

    # Interactive Plotly
    viz = oms.create_visualization("metrics-scatter", "plotly",
        code=\"\"\"
        import plotly.express as px
        def render(ctx):
            return px.scatter(ctx.data, x="epoch", y="accuracy")
        \"\"\",
        data=df.to_dict("records")
    )

    # Push to dashboard
    oms.publish_visualization(viz["id"])
"""

import base64
import io
import json
from abc import ABC, abstractmethod


# ── Visualization Context ────────────────────────────────────────────

class VisualizationContext:
    """Context object passed to visualization render functions.

    Similar to ModelContext for train(ctx)/infer(ctx), this provides
    data access and configuration for rendering.
    """

    def __init__(self, data=None, config=None, params=None):
        self.data = data or {}
        self.config = config or {}
        self.params = params or {}

    @property
    def width(self) -> int:
        return int(self.config.get("width", 800))

    @property
    def height(self) -> int:
        return int(self.config.get("height", 600))

    @property
    def theme(self) -> str:
        return self.config.get("theme", "dark")


# ── Backend Renderers ────────────────────────────────────────────────

def _render_matplotlib(fig) -> dict:
    """Convert a matplotlib Figure to SVG string."""
    buf = io.BytesIO()
    fig.savefig(buf, format="svg", bbox_inches="tight", transparent=True,
                facecolor="none", edgecolor="none")
    buf.seek(0)
    svg = buf.getvalue().decode("utf-8")
    import matplotlib.pyplot as plt
    plt.close(fig)
    return {"type": "svg", "content": svg}


def _render_plotly(fig) -> dict:
    """Convert a Plotly figure to JSON spec."""
    return {"type": "plotly", "content": fig.to_json()}


def _render_bokeh(fig) -> dict:
    """Convert a Bokeh figure to JSON."""
    from bokeh.embed import json_item
    return {"type": "bokeh", "content": json.dumps(json_item(fig))}


def _render_altair(chart) -> dict:
    """Convert an Altair chart to Vega-Lite JSON spec."""
    return {"type": "vega-lite", "content": chart.to_json()}


def _render_plotnine(plot) -> dict:
    """Convert a plotnine (ggplot) to SVG."""
    buf = io.BytesIO()
    plot.save(buf, format="svg", verbose=False)
    buf.seek(0)
    return {"type": "svg", "content": buf.getvalue().decode("utf-8")}


def _render_datashader(img) -> dict:
    """Convert a datashader image to base64 PNG."""
    buf = io.BytesIO()
    img.to_pil().save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"type": "png", "content": f"data:image/png;base64,{b64}"}


def _render_networkx(fig) -> dict:
    """Render NetworkX via matplotlib to SVG."""
    return _render_matplotlib(fig)


def _render_geopandas(fig) -> dict:
    """Render GeoPandas via matplotlib to SVG."""
    return _render_matplotlib(fig)


# Backend dispatch
_RENDERERS = {
    "matplotlib": _render_matplotlib,
    "seaborn": _render_matplotlib,
    "plotnine": _render_plotnine,
    "plotly": _render_plotly,
    "bokeh": _render_bokeh,
    "altair": _render_altair,
    "datashader": _render_datashader,
    "networkx": _render_networkx,
    "geopandas": _render_geopandas,
}

# Map backends to output types for the API
BACKEND_OUTPUT_TYPES = {
    "matplotlib": "svg",
    "seaborn": "svg",
    "plotnine": "svg",
    "plotly": "plotly",
    "bokeh": "bokeh",
    "altair": "vega-lite",
    "datashader": "png",
    "networkx": "svg",
    "geopandas": "svg",
}

SUPPORTED_BACKENDS = list(_RENDERERS.keys())


def detect_backend(obj) -> str:
    """Auto-detect visualization backend from a figure/chart object."""
    cls_name = type(obj).__module__ + "." + type(obj).__qualname__

    # Matplotlib
    try:
        import matplotlib.figure
        if isinstance(obj, matplotlib.figure.Figure):
            return "matplotlib"
    except ImportError:
        pass

    # Plotly
    try:
        import plotly.graph_objs
        if isinstance(obj, plotly.graph_objs.Figure):
            return "plotly"
    except ImportError:
        pass

    # Bokeh
    try:
        from bokeh.model import Model as BokehModel
        if isinstance(obj, BokehModel):
            return "bokeh"
    except ImportError:
        pass

    # Altair
    try:
        import altair
        if isinstance(obj, altair.Chart):
            return "altair"
    except ImportError:
        pass

    # plotnine
    try:
        import plotnine
        if isinstance(obj, plotnine.ggplot):
            return "plotnine"
    except ImportError:
        pass

    # Datashader
    try:
        import datashader.transfer_functions as tf
        if isinstance(obj, tf.Image):
            return "datashader"
    except ImportError:
        pass

    raise TypeError(
        f"Cannot auto-detect visualization backend for {type(obj).__name__}. "
        f"Supported backends: {', '.join(SUPPORTED_BACKENDS)}"
    )


def render(obj, backend: str = None, viz_id: str = None, _client=None) -> dict:
    """Render a visualization object to its output format.

    Auto-detects the backend if not specified. When ``viz_id`` is provided,
    the rendered output is automatically pushed to the platform so it
    appears in the visualization preview and on dashboards.

    Args:
        obj: A figure/chart object (matplotlib Figure, plotly Figure, etc.)
        backend: Override backend detection
        viz_id: Optional visualization UUID — when set, the rendered output
                is saved to the API so the web UI can display it.

    Returns:
        Dict with 'type' (svg/plotly/bokeh/vega-lite/png) and 'content'
    """
    if backend is None:
        backend = detect_backend(obj)
    renderer = _RENDERERS.get(backend)
    if renderer is None:
        raise ValueError(f"Unsupported backend: {backend}. Supported: {', '.join(SUPPORTED_BACKENDS)}")
    result = renderer(obj)

    # Push rendered output to the platform when viz_id is provided
    if viz_id:
        if _client is None:
            from .model import _get_client
            _client = _get_client()
        try:
            _client._put(f"/sdk/visualizations/{viz_id}", {
                "rendered_output": result["content"],
            })
        except Exception:
            # Don't fail the render if the push fails (e.g. no API connection)
            pass

    return result


# ── SDK Integration Functions ─────────────────────────────────────────

def create_visualization(
    name: str,
    backend: str,
    code: str = None,
    data: dict = None,
    config: dict = None,
    description: str = None,
    refresh_interval: int = None,
    _client=None,
) -> dict:
    """Create and save a visualization to the platform.

    The code should define a ``render(ctx)`` function that returns
    a figure/chart object appropriate for the backend.

    Args:
        name: Visualization name
        backend: One of: matplotlib, seaborn, plotly, bokeh, altair, plotnine, datashader, networkx, geopandas
        code: Python code with a render(ctx) function
        data: Data dict to pass to the render context
        config: Config dict (width, height, theme, etc.)
        description: Optional description
        refresh_interval: For dynamic visualizations, seconds between refreshes (0 = static)

    Returns:
        Dict with visualization id and metadata
    """
    if backend not in SUPPORTED_BACKENDS:
        raise ValueError(f"Unsupported backend: {backend}. Supported: {', '.join(SUPPORTED_BACKENDS)}")

    body = {
        "name": name,
        "backend": backend,
        "output_type": BACKEND_OUTPUT_TYPES[backend],
    }
    if code:
        body["code"] = code
    if data is not None:
        body["data"] = data
    if config:
        body["config"] = config
    if description:
        body["description"] = description
    if refresh_interval is not None:
        body["refresh_interval"] = refresh_interval

    if _client is None:
        from .model import _get_client
        _client = _get_client()

    if _client.project_id:
        body["project_id"] = _client.project_id

    return _client._post("/sdk/visualizations", body)


def publish_visualization(viz_id: str, _client=None) -> dict:
    """Publish a visualization to the dashboard.

    Makes the visualization visible in the Visualizations section
    of the OpenModelStudio dashboard.

    Args:
        viz_id: UUID of the visualization
    """
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    return _client._post(f"/sdk/visualizations/{viz_id}/publish", {})


def render_visualization(viz_id: str, data: dict = None, _client=None) -> dict:
    """Execute a saved visualization and return the rendered output.

    Args:
        viz_id: UUID of the visualization
        data: Optional data override

    Returns:
        Dict with 'type' and 'content' (the rendered output)
    """
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    body = {}
    if data is not None:
        body["data"] = data
    return _client._post(f"/sdk/visualizations/{viz_id}/render", body)


def list_visualizations(project_id: str = None, _client=None) -> list:
    """List all visualizations in the current project.

    Returns:
        List of visualization metadata dicts
    """
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    params = {}
    pid = project_id or _client.project_id
    if pid:
        params["project_id"] = pid
    return _client._get("/sdk/visualizations", params=params)


def delete_visualization(viz_id: str, _client=None) -> dict:
    """Delete a visualization.

    Args:
        viz_id: UUID of the visualization
    """
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    return _client._delete(f"/sdk/visualizations/{viz_id}")


# ── Dashboard Functions ───────────────────────────────────────────────

def create_dashboard(
    name: str,
    layout: list = None,
    description: str = None,
    _client=None,
) -> dict:
    """Create a dashboard that composes multiple visualizations.

    The layout is a list of panel definitions, each specifying
    a visualization and its grid position.

    Args:
        name: Dashboard name
        layout: List of panel dicts, each with:
            - visualization_id: UUID of the visualization
            - x, y: Grid position (0-based)
            - w, h: Width and height in grid units
        description: Optional description

    Returns:
        Dict with dashboard id and metadata

    Example::

        oms.create_dashboard("Training Overview", layout=[
            {"visualization_id": "abc-123", "x": 0, "y": 0, "w": 6, "h": 4},
            {"visualization_id": "def-456", "x": 6, "y": 0, "w": 6, "h": 4},
        ])
    """
    if _client is None:
        from .model import _get_client
        _client = _get_client()

    body = {"name": name}
    if layout:
        body["layout"] = layout
    if description:
        body["description"] = description
    if _client.project_id:
        body["project_id"] = _client.project_id

    return _client._post("/sdk/dashboards", body)


def update_dashboard(dashboard_id: str, layout: list = None, name: str = None,
                     _client=None) -> dict:
    """Update a dashboard's layout or name.

    Args:
        dashboard_id: UUID of the dashboard
        layout: New layout (replaces existing)
        name: New name
    """
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    body = {}
    if layout is not None:
        body["layout"] = layout
    if name is not None:
        body["name"] = name
    return _client._put(f"/sdk/dashboards/{dashboard_id}", body)


def list_dashboards(project_id: str = None, _client=None) -> list:
    """List all dashboards in the current project."""
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    params = {}
    pid = project_id or _client.project_id
    if pid:
        params["project_id"] = pid
    return _client._get("/sdk/dashboards", params=params)


def get_dashboard(dashboard_id: str, _client=None) -> dict:
    """Get a dashboard by ID including its layout."""
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    return _client._get(f"/sdk/dashboards/{dashboard_id}")


def delete_dashboard(dashboard_id: str, _client=None) -> dict:
    """Delete a dashboard."""
    if _client is None:
        from .model import _get_client
        _client = _get_client()
    return _client._delete(f"/sdk/dashboards/{dashboard_id}")
