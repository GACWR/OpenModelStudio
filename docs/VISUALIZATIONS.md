# Visualizations & Dashboards

Create, render, and publish data visualizations from notebooks. Combine them into drag-and-drop dashboards for real-time monitoring. OpenModelStudio supports **9 visualization backends** with a unified abstraction that works the same way regardless of which library you choose.

## Supported Backends

| Backend | Output Type | Description |
|---------|-------------|-------------|
| **matplotlib** | SVG | Standard Python plotting (line, bar, scatter, heatmap, etc.) |
| **seaborn** | SVG | Statistical visualization built on matplotlib |
| **plotly** | Plotly JSON | Interactive charts with zoom, pan, hover tooltips |
| **bokeh** | Bokeh JSON | Interactive web-ready charts with streaming support |
| **altair** | Vega-Lite JSON | Declarative statistical visualization (Vega-Lite spec) |
| **plotnine** | SVG | ggplot2-style grammar of graphics for Python |
| **datashader** | PNG | Server-side rendering for massive datasets (millions of points) |
| **networkx** | SVG | Network/graph visualizations |
| **geopandas** | SVG | Geospatial map visualizations |

## Quick Start

### From a JupyterLab Workspace

```python
import openmodelstudio as oms
import matplotlib.pyplot as plt
import numpy as np

# 1. Create a visualization record
viz = oms.create_visualization("training-loss",
    backend="matplotlib",
    description="Training loss over epochs")

# 2. Render it
fig, ax = plt.subplots()
epochs = np.arange(1, 21)
loss = 0.9 * np.exp(-0.15 * epochs) + 0.05
ax.plot(epochs, loss, color="#8b5cf6", linewidth=2)
ax.set_xlabel("Epoch")
ax.set_ylabel("Loss")
ax.set_title("Training Loss")

# 3. Push rendered output to platform
output = oms.render(fig)  # auto-detects matplotlib → SVG
oms.publish_visualization(viz["id"])
```

After running this cell, the visualization appears on the **Visualizations** page and is available for dashboards.

### Plotly (Interactive, JSON-Based)

Plotly visualizations are JSON specs that render interactively in the browser with zoom, pan, and hover.

```python
import openmodelstudio as oms

viz = oms.create_visualization("accuracy-curve",
    backend="plotly",
    description="Model accuracy vs epoch")

# For Plotly, the code is a JSON spec — edit it directly in the browser editor
# or define it programmatically:
import plotly.graph_objects as go

fig = go.Figure()
fig.add_trace(go.Scatter(
    x=list(range(1, 11)),
    y=[0.5, 0.62, 0.71, 0.78, 0.82, 0.85, 0.87, 0.89, 0.90, 0.91],
    mode="lines+markers",
    name="Accuracy",
    line=dict(color="#10b981"),
))
fig.update_layout(title="Model Accuracy", xaxis_title="Epoch", yaxis_title="Accuracy")

output = oms.render(fig)  # auto-detects plotly → Plotly JSON
oms.publish_visualization(viz["id"])
```

### Altair / Vega-Lite (Declarative)

Altair charts are Vega-Lite JSON specs. You can write them as Python or edit JSON directly in the browser editor.

```python
import openmodelstudio as oms
import altair as alt
import pandas as pd

viz = oms.create_visualization("feature-distribution",
    backend="altair",
    description="Distribution of model features")

data = pd.DataFrame({
    "feature": ["Age", "Fare", "Pclass", "SibSp", "Parch"],
    "importance": [0.28, 0.25, 0.22, 0.15, 0.10],
})

chart = alt.Chart(data).mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
    x=alt.X("feature", sort="-y"),
    y="importance",
    color=alt.Color("feature", scale=alt.Scale(scheme="category10")),
)

output = oms.render(chart)  # auto-detects altair → Vega-Lite JSON
oms.publish_visualization(viz["id"])
```

### Seaborn (Statistical)

```python
import openmodelstudio as oms
import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

viz = oms.create_visualization("correlation-heatmap",
    backend="seaborn",
    description="Feature correlation matrix")

data = pd.DataFrame(np.random.randn(100, 5), columns=["A", "B", "C", "D", "E"])
fig, ax = plt.subplots(figsize=(8, 6))
sns.heatmap(data.corr(), annot=True, cmap="coolwarm", ax=ax)

output = oms.render(fig)
oms.publish_visualization(viz["id"])
```

### Bokeh (Interactive Streaming)

```python
import openmodelstudio as oms
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource
import numpy as np

viz = oms.create_visualization("signal-plot",
    backend="bokeh",
    description="Real-time signal visualization",
    refresh_interval=10)  # re-render every 10 seconds

x = np.linspace(0, 4 * np.pi, 200)
y = np.sin(x)
source = ColumnDataSource(data=dict(x=x, y=y))

p = figure(title="Signal", width=800, height=400)
p.line("x", "y", source=source, line_width=2, color="#8b5cf6")

output = oms.render(p)
oms.publish_visualization(viz["id"])
```

### NetworkX (Graphs)

```python
import openmodelstudio as oms
import networkx as nx
import matplotlib.pyplot as plt

viz = oms.create_visualization("model-graph",
    backend="networkx",
    description="Model architecture as a graph")

G = nx.karate_club_graph()
fig, ax = plt.subplots(figsize=(10, 8))
pos = nx.spring_layout(G, seed=42)
nx.draw_networkx(G, pos, ax=ax, node_color="#8b5cf6",
                 edge_color="rgba(200,200,200,0.3)",
                 font_color="black", node_size=300)

output = oms.render(fig)
oms.publish_visualization(viz["id"])
```

### Datashader (Large Datasets)

```python
import openmodelstudio as oms
import datashader as ds
import pandas as pd
import numpy as np

viz = oms.create_visualization("embedding-scatter",
    backend="datashader",
    description="1M point embedding visualization")

n = 1_000_000
data = pd.DataFrame({"x": np.random.randn(n), "y": np.random.randn(n)})
canvas = ds.Canvas(plot_width=800, plot_height=600)
agg = canvas.points(data, "x", "y")
img = ds.tf.shade(agg, cmap=["#000000", "#8b5cf6", "#ffffff"])

output = oms.render(img)
oms.publish_visualization(viz["id"])
```

### GeoPandas (Maps)

```python
import openmodelstudio as oms
import geopandas as gpd
import matplotlib.pyplot as plt

viz = oms.create_visualization("data-coverage",
    backend="geopandas",
    description="Geographic data distribution")

world = gpd.read_file(gpd.datasets.get_path("naturalearth_lowres"))
fig, ax = plt.subplots(figsize=(12, 6))
world.plot(ax=ax, color="#8b5cf6", edgecolor="rgba(255,255,255,0.3)")
ax.set_title("Data Coverage")

output = oms.render(fig)
oms.publish_visualization(viz["id"])
```

## The `render()` Function

The `oms.render()` function auto-detects the backend from the object type and converts it to the appropriate output format:

| Input Object | Detected Backend | Output |
|-------------|-----------------|--------|
| `matplotlib.figure.Figure` | matplotlib | SVG string |
| `plotly.graph_objects.Figure` | plotly | Plotly JSON string |
| `bokeh.model.Model` | bokeh | Bokeh JSON string |
| `altair.Chart` | altair | Vega-Lite JSON string |
| `plotnine.ggplot` | plotnine | SVG string |
| `datashader.transfer_functions.Image` | datashader | Base64 PNG data URL |
| `networkx.Graph` | networkx | SVG string (via matplotlib) |
| `geopandas.GeoDataFrame` | geopandas | SVG string (via matplotlib) |

You never need to specify the backend manually when calling `render()` -- it inspects the object's class.

## In-Browser Visualization Editor

Every visualization has a full editor at `/visualizations/{id}` with:

- **Monaco code editor** with syntax highlighting (Python for most backends, JSON for Plotly/Altair)
- **Live preview** for JSON-based backends (Plotly, Altair) -- edits render instantly
- **Template insertion** -- pre-built starter code for each backend
- **Data tab** -- attach JSON data that gets passed as `ctx.data` to the render function
- **Config tab** -- set refresh interval, output type, and custom config JSON
- **Publish button** -- make the visualization available for dashboards

### JSON-Based Backends (Plotly, Altair)

For Plotly and Altair, the code in the editor IS the visualization spec. Changes render live in the preview pane -- no notebook execution needed.

### Python-Based Backends (matplotlib, seaborn, etc.)

For Python backends, the editor shows the `render(ctx)` function. The preview displays the last rendered output from a notebook execution. To update the preview, run `oms.render()` in a notebook.

## Dashboards

Dashboards combine multiple visualizations into a single view with drag-and-drop layout.

### Creating a Dashboard

```python
import openmodelstudio as oms

dashboard = oms.create_dashboard("Training Monitor",
    description="Real-time training metrics overview")

print(f"Dashboard: {dashboard['id']}")
```

Or create one from the **Dashboards** page in the sidebar.

### Adding Panels

From the dashboard page (`/dashboards/{id}`):

1. Click **Add Panel**
2. Select a visualization from the dropdown
3. Choose initial width (quarter, third, half, two-thirds, full) and height
4. Click **Add Panel**

Panels can be:
- **Dragged** to rearrange (grab the grip handle on the left)
- **Resized** by dragging corners
- **Removed** with the X button
- **Maximized** to open the full visualization editor

### Locking the Layout

Toggle the **Lock/Unlock** button to prevent accidental rearrangement. When locked, drag and resize are disabled.

### Saving

Click **Save Layout** when you see the "Unsaved changes" badge. The layout is stored as JSON in the database and persists across sessions.

### Dashboard SDK

```python
import openmodelstudio as oms

# List dashboards
dashboards = oms.list_dashboards()

# Get a specific dashboard
dash = oms.get_dashboard(dashboard_id)

# Update layout programmatically
oms.update_dashboard(dashboard_id,
    name="Updated Name",
    layout=[
        {"visualization_id": "...", "x": 0, "y": 0, "w": 6, "h": 2},
        {"visualization_id": "...", "x": 6, "y": 0, "w": 6, "h": 2},
    ])

# Delete a dashboard
oms.delete_dashboard(dashboard_id)
```

## API Reference

All visualization and dashboard operations are available via REST API.

### Visualizations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/visualizations` | List all visualizations |
| POST | `/visualizations` | Create a visualization |
| GET | `/visualizations/{id}` | Get visualization details |
| PUT | `/visualizations/{id}` | Update visualization |
| DELETE | `/visualizations/{id}` | Delete visualization |
| POST | `/visualizations/{id}/publish` | Publish for dashboards |

### Dashboards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboards` | List all dashboards |
| POST | `/dashboards` | Create a dashboard |
| GET | `/dashboards/{id}` | Get dashboard with layout |
| PUT | `/dashboards/{id}` | Update dashboard layout |
| DELETE | `/dashboards/{id}` | Delete dashboard |

### Create Visualization Request

```json
{
  "name": "training-loss",
  "backend": "matplotlib",
  "description": "Training loss over epochs",
  "code": "def render(ctx): ...",
  "refresh_interval": 0
}
```

The `output_type` is auto-detected from the backend if not specified.

## Dynamic Visualizations

Set `refresh_interval` to a non-zero value (in seconds) to create auto-refreshing visualizations. The platform will re-execute the render function at the specified interval.

```python
viz = oms.create_visualization("live-metrics",
    backend="plotly",
    refresh_interval=5)  # refresh every 5 seconds
```

This is useful for monitoring dashboards that track training progress, system metrics, or streaming data.

## Tips

- **Start with Plotly or Altair** for interactive charts -- they render live in the browser editor without needing a notebook
- **Use matplotlib/seaborn** when you need publication-quality static figures
- **Use datashader** for datasets with more than 100k points -- it renders server-side and sends a PNG
- **Set refresh_interval > 0** for live monitoring dashboards
- **Publish visualizations** before adding them to dashboards
- The browser editor loads Plotly.js, Vega-Embed, and BokehJS from CDN on demand -- no frontend bundle bloat
