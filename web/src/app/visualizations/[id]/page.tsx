"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ErrorState } from "@/components/shared/error-state";
import { VizRenderer, downloadVisualization } from "@/components/shared/viz-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Play,
  Upload,
  Code2,
  Database,
  Settings2,
  BarChart3,
  Loader2,
  Check,
  Download,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Dynamic import Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface Visualization {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  backend: string;
  output_type: string;
  code: string | null;
  config: Record<string, any> | null;
  refresh_interval: number | null;
  published: boolean;
  rendered_output: string | null;
  created_at: string;
  updated_at: string;
}

const backendColors: Record<string, string> = {
  matplotlib: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  seaborn: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  plotly: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  bokeh: "bg-green-500/10 text-green-400 border-green-500/20",
  altair: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  plotnine: "bg-red-500/10 text-red-400 border-red-500/20",
  datashader: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  networkx: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  geopandas: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

// Map backend to language for Monaco syntax highlighting
const backendLanguage: Record<string, string> = {
  matplotlib: "python",
  seaborn: "python",
  plotnine: "python",
  plotly: "json",
  bokeh: "python",
  altair: "json",
  datashader: "python",
  networkx: "python",
  geopandas: "python",
};

// Template code for each backend
const TEMPLATES: Record<string, string> = {
  matplotlib: `import matplotlib.pyplot as plt
import numpy as np

def render(ctx):
    """Render a matplotlib visualization."""
    fig, ax = plt.subplots(figsize=(ctx.width / 100, ctx.height / 100))
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    # Example: line chart
    x = np.linspace(0, 10, 100)
    y = np.sin(x)
    ax.plot(x, y, color="#8b5cf6", linewidth=2)

    ax.set_title("Sine Wave", color="white")
    ax.tick_params(colors="white")
    for spine in ax.spines.values():
        spine.set_color("rgba(255,255,255,0.2)")

    return fig
`,
  seaborn: `import seaborn as sns
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

def render(ctx):
    """Render a seaborn visualization."""
    fig, ax = plt.subplots(figsize=(ctx.width / 100, ctx.height / 100))
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    # Example: scatter plot
    data = pd.DataFrame({
        "x": np.random.randn(100),
        "y": np.random.randn(100),
        "category": np.random.choice(["A", "B", "C"], 100),
    })
    sns.scatterplot(data=data, x="x", y="y", hue="category", ax=ax)
    ax.tick_params(colors="white")
    ax.set_title("Scatter Plot", color="white")

    return fig
`,
  plotly: `{
  "data": [
    {
      "type": "scatter",
      "mode": "lines+markers",
      "x": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "y": [0.9, 0.75, 0.6, 0.45, 0.35, 0.28, 0.22, 0.18, 0.15, 0.12],
      "name": "Training Loss",
      "line": { "color": "#8b5cf6", "width": 2 },
      "marker": { "size": 6 }
    },
    {
      "type": "scatter",
      "mode": "lines+markers",
      "x": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "y": [0.5, 0.6, 0.68, 0.74, 0.78, 0.82, 0.85, 0.87, 0.89, 0.91],
      "name": "Accuracy",
      "line": { "color": "#10b981", "width": 2 },
      "marker": { "size": 6 },
      "yaxis": "y2"
    }
  ],
  "layout": {
    "title": { "text": "Training Metrics", "font": { "color": "white" } },
    "xaxis": { "title": "Epoch" },
    "yaxis": { "title": "Loss" },
    "yaxis2": { "title": "Accuracy", "overlaying": "y", "side": "right" },
    "legend": { "x": 0, "y": 1.15, "orientation": "h" }
  }
}
`,
  altair: `{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": { "type": "bar", "cornerRadiusTopLeft": 3, "cornerRadiusTopRight": 3 },
  "encoding": {
    "x": {
      "field": "category",
      "type": "nominal",
      "axis": { "labelAngle": 0 }
    },
    "y": {
      "field": "value",
      "type": "quantitative"
    },
    "color": {
      "field": "category",
      "type": "nominal",
      "scale": { "scheme": "category10" }
    }
  },
  "data": {
    "values": [
      { "category": "A", "value": 28 },
      { "category": "B", "value": 55 },
      { "category": "C", "value": 43 },
      { "category": "D", "value": 91 },
      { "category": "E", "value": 81 },
      { "category": "F", "value": 53 }
    ]
  },
  "width": "container",
  "height": 300,
  "title": "Category Distribution"
}
`,
  bokeh: `from bokeh.plotting import figure
from bokeh.models import ColumnDataSource
import numpy as np

def render(ctx):
    """Render a Bokeh visualization."""
    x = np.linspace(0, 4 * np.pi, 100)
    y = np.sin(x)

    source = ColumnDataSource(data=dict(x=x, y=y))
    p = figure(title="Sine Wave", width=ctx.width, height=ctx.height,
               background_fill_alpha=0, border_fill_alpha=0)
    p.line("x", "y", source=source, line_width=2, color="#8b5cf6")

    return p
`,
  plotnine: `from plotnine import *
import pandas as pd
import numpy as np

def render(ctx):
    """Render a plotnine (ggplot2) visualization."""
    data = pd.DataFrame({
        "x": np.random.randn(200),
        "y": np.random.randn(200),
        "group": np.random.choice(["Alpha", "Beta"], 200),
    })
    return (
        ggplot(data, aes("x", "y", color="group"))
        + geom_point(alpha=0.6)
        + theme_minimal()
        + labs(title="Scatter Plot")
    )
`,
  datashader: `import datashader as ds
import pandas as pd
import numpy as np

def render(ctx):
    """Render a datashader image for large datasets."""
    n = 1_000_000
    data = pd.DataFrame({
        "x": np.random.randn(n),
        "y": np.random.randn(n) + np.random.randn(n) * 0.5,
    })
    canvas = ds.Canvas(plot_width=ctx.width, plot_height=ctx.height)
    agg = canvas.points(data, "x", "y")
    return ds.tf.shade(agg, cmap=["#000000", "#8b5cf6", "#ffffff"])
`,
  networkx: `import networkx as nx
import matplotlib.pyplot as plt

def render(ctx):
    """Render a NetworkX graph."""
    fig, ax = plt.subplots(figsize=(ctx.width / 100, ctx.height / 100))
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    G = nx.karate_club_graph()
    pos = nx.spring_layout(G, seed=42)
    nx.draw_networkx(G, pos, ax=ax, node_color="#8b5cf6",
                     edge_color=(1, 1, 1, 0.2),
                     font_color="white", node_size=200)
    ax.set_title("Karate Club Graph", color="white")

    return fig
`,
  geopandas: `import geopandas as gpd
import matplotlib.pyplot as plt

def render(ctx):
    """Render a GeoPandas map."""
    fig, ax = plt.subplots(figsize=(ctx.width / 100, ctx.height / 100))
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    url = "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip"
    world = gpd.read_file(url)
    world.plot(ax=ax, color="#8b5cf6", edgecolor=(1, 1, 1, 0.3))
    ax.set_title("World Map", color="white")
    ax.tick_params(colors="white")

    return fig
`,
};

export default function VisualizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [viz, setViz] = useState<Visualization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Editor state
  const [code, setCode] = useState("");
  const [dataJson, setDataJson] = useState("{}");
  const [configJson, setConfigJson] = useState("{}");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [refreshInterval, setRefreshInterval] = useState("0");
  const [showPreview, setShowPreview] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [activeTab, setActiveTab] = useState("code");
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Live preview state for interactive backends (plotly, vega-lite)
  const [previewOutput, setPreviewOutput] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("svg");
  // Track whether the user has edited code (vs initial load from DB)
  const userEditedCode = useRef(false);

  const fetchViz = useCallback(() => {
    setLoading(true);
    setError(null);
    userEditedCode.current = false;
    api
      .get<Visualization>(`/visualizations/${id}`)
      .then((v) => {
        setViz(v);
        setCode(v.code || TEMPLATES[v.backend] || "");
        setName(v.name);
        setDescription(v.description || "");
        setRefreshInterval(String(v.refresh_interval || 0));
        setPreviewOutput(v.rendered_output);
        setPreviewType(v.output_type);
        if (v.config) {
          try {
            setConfigJson(JSON.stringify(v.config, null, 2));
          } catch {
            setConfigJson("{}");
          }
        }
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load visualization"
        )
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchViz();
  }, [fetchViz]);

  // Live preview for JSON-based backends (plotly, altair/vega-lite)
  // Only update preview when the user actively edits code, not on initial load
  useEffect(() => {
    if (!viz || !userEditedCode.current) return;
    const backend = viz.backend.toLowerCase();
    if (backend === "plotly" || backend === "altair") {
      try {
        JSON.parse(code);
        setPreviewOutput(code);
        setPreviewType(backend === "plotly" ? "plotly" : "vega-lite");
      } catch {
        // Invalid JSON, don't update preview
      }
    }
  }, [code, viz]);

  const handleSave = async () => {
    if (!viz) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name,
        description: description || null,
        code,
        refresh_interval: parseInt(refreshInterval) || 0,
      };

      // For JSON-based backends, save the code as rendered_output too
      const backend = viz.backend.toLowerCase();
      if (backend === "plotly" || backend === "altair") {
        try {
          JSON.parse(code);
          body.rendered_output = code;
        } catch {
          // Not valid JSON, skip
        }
      }

      try {
        const parsed = JSON.parse(configJson);
        body.config = parsed;
      } catch {
        // Skip invalid JSON
      }

      try {
        const parsed = JSON.parse(dataJson);
        body.data = parsed;
      } catch {
        // Skip invalid JSON
      }

      await api.put(`/visualizations/${id}`, body);
      toast.success("Visualization saved");
      setHasChanges(false);
      fetchViz();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save"
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await api.post(`/visualizations/${id}/publish`, {});
      toast.success("Visualization published to dashboard");
      fetchViz();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to publish"
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    userEditedCode.current = true;
    setCode(value || "");
    setHasChanges(true);
  };

  const handleInsertTemplate = () => {
    if (!viz) return;
    const template = TEMPLATES[viz.backend];
    if (template) {
      setCode(template);
      setHasChanges(true);
      toast.success("Template inserted");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <AnimatedPage className="flex items-center justify-center h-[80vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </AnimatedPage>
      </AppShell>
    );
  }

  if (error || !viz) {
    return (
      <AppShell>
        <AnimatedPage>
          <ErrorState message={error || "Not found"} onRetry={fetchViz} />
        </AnimatedPage>
      </AppShell>
    );
  }

  const isJsonBackend = viz.backend === "plotly" || viz.backend === "altair";
  const editorLanguage = isJsonBackend ? "json" : "python";

  return (
    <AppShell>
      <AnimatedPage className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-1 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/visualizations")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </motion.div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setHasChanges(true);
                    }}
                    className="h-7 border-none bg-transparent text-lg font-bold p-0 focus-visible:ring-0 text-foreground"
                  />
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      backendColors[viz.backend.toLowerCase()] || ""
                    }`}
                  >
                    {viz.backend}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      viz.published
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    <span
                      className={`mr-1.5 h-1.5 w-1.5 rounded-full inline-block ${
                        viz.published ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    {viz.published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <Input
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="Add a description..."
                  className="h-5 mt-0.5 border-none bg-transparent text-xs text-muted-foreground p-0 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border text-xs"
                onClick={() => {
                  if (showCode && !showPreview) {
                    setShowPreview(true);
                  }
                  setShowCode(!showCode);
                }}
              >
                <Code2 className="h-3.5 w-3.5" />
                {showCode ? "Hide Code" : "Show Code"}
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border text-xs"
                onClick={() => {
                  if (showPreview && !showCode) {
                    setShowCode(true);
                  }
                  setShowPreview(!showPreview);
                }}
              >
                {showPreview ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {showPreview ? "Hide Preview" : "Show Preview"}
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border text-xs"
                onClick={() =>
                  downloadVisualization(
                    name || "visualization",
                    previewType,
                    previewOutput,
                    previewContainerRef.current,
                  )
                }
                disabled={!previewOutput}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </motion.div>

            {!viz.published && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border text-xs"
                  onClick={handlePublish}
                  disabled={publishing}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {publishing ? "Publishing..." : "Publish"}
                </Button>
              </motion.div>
            )}

            <AnimatePresence>
              {hasChanges && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    size="sm"
                    className="gap-1.5 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10 text-xs"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Editor + Preview split */}
        <div className="flex-1 grid gap-4 min-h-0" style={{
          gridTemplateColumns:
            showCode && showPreview
              ? "1fr 1fr"
              : "1fr",
        }}>
          {/* Left: Code Editor */}
          {showCode && (
          <GlassCard className="flex flex-col min-h-0 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="bg-muted/30 mx-3 mt-3 shrink-0">
                <TabsTrigger value="code" className="gap-1.5 text-xs">
                  <Code2 className="h-3.5 w-3.5" />
                  {isJsonBackend ? "Spec (JSON)" : "Code (Python)"}
                </TabsTrigger>
                <TabsTrigger value="data" className="gap-1.5 text-xs">
                  <Database className="h-3.5 w-3.5" />
                  Data
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-1.5 text-xs">
                  <Settings2 className="h-3.5 w-3.5" />
                  Config
                </TabsTrigger>
              </TabsList>

              <TabsContent value="code" className="flex-1 m-0 mt-2 min-h-0">
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-3 pb-2">
                    <p className="text-[10px] text-muted-foreground/60">
                      {isJsonBackend
                        ? `Paste or edit a ${viz.backend === "plotly" ? "Plotly" : "Vega-Lite"} JSON spec. It renders live in the preview.`
                        : `Write a render(ctx) function that returns a ${viz.backend} figure object.`}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={handleInsertTemplate}
                    >
                      Insert Template
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <MonacoEditor
                      height="100%"
                      language={editorLanguage}
                      theme="vs-dark"
                      value={code}
                      onChange={handleCodeChange}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineHeight: 20,
                        padding: { top: 8 },
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        automaticLayout: true,
                        tabSize: 4,
                        renderWhitespace: "selection",
                        suggestOnTriggerCharacters: true,
                        folding: true,
                        bracketPairColorization: { enabled: true },
                      }}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="data" className="flex-1 m-0 mt-2 min-h-0">
                <div className="h-full flex flex-col">
                  <div className="px-3 pb-2">
                    <p className="text-[10px] text-muted-foreground/60">
                      JSON data passed as ctx.data to the render function.
                    </p>
                  </div>
                  <div className="flex-1 min-h-0">
                    <MonacoEditor
                      height="100%"
                      language="json"
                      theme="vs-dark"
                      value={dataJson}
                      onChange={(v) => {
                        setDataJson(v || "{}");
                        setHasChanges(true);
                      }}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineHeight: 20,
                        padding: { top: 8 },
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        automaticLayout: true,
                        tabSize: 2,
                      }}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="config" className="flex-1 m-0 mt-2 min-h-0">
                <div className="h-full flex flex-col px-3 gap-3 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Refresh Interval (seconds)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={refreshInterval}
                      onChange={(e) => {
                        setRefreshInterval(e.target.value);
                        setHasChanges(true);
                      }}
                      className="border bg-muted h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground/60">
                      Set to 0 for static. For dynamic visualizations, this
                      controls how often the render function re-executes.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Config JSON (width, height, theme, etc.)
                    </Label>
                    <div className="flex-1 min-h-[200px] rounded-lg overflow-hidden border border-border/50">
                      <MonacoEditor
                        height="200px"
                        language="json"
                        theme="vs-dark"
                        value={configJson}
                        onChange={(v) => {
                          setConfigJson(v || "{}");
                          setHasChanges(true);
                        }}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 12,
                          lineHeight: 18,
                          scrollBeyondLastLine: false,
                          wordWrap: "on",
                          automaticLayout: true,
                          tabSize: 2,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Output Type
                    </Label>
                    <Badge
                      variant="outline"
                      className="text-xs"
                    >
                      {viz.output_type}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground/60">
                      Auto-detected from backend. SVG for matplotlib/seaborn/plotnine/networkx/geopandas,
                      Plotly JSON for plotly, Vega-Lite JSON for altair, Bokeh JSON for bokeh,
                      PNG for datashader.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </GlassCard>
          )}

          {/* Right: Preview */}
          {showPreview && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <GlassCard className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Preview
                    </span>
                  </div>
                  {isJsonBackend && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] bg-emerald-500/10 text-emerald-400"
                    >
                      <Check className="h-2.5 w-2.5 mr-1" />
                      Live
                    </Badge>
                  )}
                  {!isJsonBackend && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] bg-muted"
                    >
                      Rendered from notebook
                    </Badge>
                  )}
                </div>
                <div className="flex-1 min-h-0 px-3 pb-3" ref={previewContainerRef}>
                  <div className="h-full rounded-lg border border-white/[0.06] bg-black/20 overflow-hidden">
                    <VizRenderer
                      outputType={previewType}
                      renderedOutput={previewOutput}
                    />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </div>
      </AnimatedPage>
    </AppShell>
  );
}
