"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { VizRenderer } from "@/components/shared/viz-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Plus,
  Save,
  ArrowLeft,
  X,
  BarChart3,
  GripVertical,
  Maximize2,
  Lock,
  Unlock,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WidthProvider, Responsive } from "react-grid-layout/legacy";
import type { Layout, LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardLayoutItem {
  visualization_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  layout: DashboardLayoutItem[] | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface VisualizationFull {
  id: string;
  name: string;
  backend: string;
  output_type: string;
  description: string | null;
  rendered_output: string | null;
  published: boolean;
}

interface VisualizationSummary {
  id: string;
  name: string;
  backend: string;
  output_type: string;
  description: string | null;
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

const ROW_HEIGHT = 120;

export default function DashboardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [allVisualizations, setAllVisualizations] = useState<VisualizationSummary[]>([]);
  const [vizDetails, setVizDetails] = useState<Map<string, VisualizationFull>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [locked, setLocked] = useState(false);

  // Dashboard panel layout
  const [panels, setPanels] = useState<DashboardLayoutItem[]>([]);

  // Add panel dialog
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [selectedVizId, setSelectedVizId] = useState("");
  const [panelWidth, setPanelWidth] = useState("6");
  const [panelHeight, setPanelHeight] = useState("2");

  // Fetch the full visualization detail (with rendered_output) for a given ID
  const fetchVizDetail = useCallback(async (vizId: string) => {
    try {
      const detail = await api.get<VisualizationFull>(`/visualizations/${vizId}`);
      setVizDetails((prev) => {
        const next = new Map(prev);
        next.set(vizId, detail);
        return next;
      });
    } catch {
      // Visualization may have been deleted; skip
    }
  }, []);

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<Dashboard>(`/dashboards/${id}`),
      api.get<VisualizationSummary[]>("/visualizations"),
    ])
      .then(([dash, vizs]) => {
        setDashboard(dash);
        const items: DashboardLayoutItem[] = Array.isArray(dash.layout) ? dash.layout : [];
        setPanels(items);
        setAllVisualizations(vizs);

        // Fetch full detail for each panel's visualization
        const uniqueIds = [...new Set(items.map((p) => p.visualization_id))];
        uniqueIds.forEach(fetchVizDetail);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      )
      .finally(() => setLoading(false));
  }, [id, fetchVizDetail]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Convert our panels to react-grid-layout format
  const rglLayout: LayoutItem[] = useMemo(
    () =>
      panels.map((p, i) => ({
        i: String(i),
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        minW: 2,
        minH: 1,
        maxW: 12,
      })),
    [panels]
  );

  // Handle layout change from drag/resize
  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const updated = panels.map((panel, i) => {
        const item = newLayout.find((l) => l.i === String(i));
        if (!item) return panel;
        return {
          ...panel,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        };
      });
      setPanels(updated);
      setHasChanges(true);
    },
    [panels]
  );

  const handleAddPanel = () => {
    if (!selectedVizId) {
      toast.error("Select a visualization");
      return;
    }
    const w = parseInt(panelWidth) || 6;
    const h = parseInt(panelHeight) || 2;
    const maxY = panels.reduce((max, p) => Math.max(max, p.y + p.h), 0);

    const newPanel: DashboardLayoutItem = {
      visualization_id: selectedVizId,
      x: 0,
      y: maxY,
      w,
      h,
    };
    setPanels([...panels, newPanel]);
    setHasChanges(true);
    setAddPanelOpen(false);
    setSelectedVizId("");
    setPanelWidth("6");
    setPanelHeight("2");

    // Fetch viz detail if not already loaded
    if (!vizDetails.has(selectedVizId)) {
      fetchVizDetail(selectedVizId);
    }

    toast.success("Panel added");
  };

  const handleRemovePanel = (index: number) => {
    setPanels(panels.filter((_, i) => i !== index));
    setHasChanges(true);
    toast.success("Panel removed");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/dashboards/${id}`, {
        name: dashboard?.name,
        description: dashboard?.description,
        layout: panels,
      });
      toast.success("Dashboard saved");
      setHasChanges(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save dashboard"
      );
    } finally {
      setSaving(false);
    }
  };

  const getViz = (vizId: string) => vizDetails.get(vizId);
  const getVizSummary = (vizId: string) =>
    allVisualizations.find((v) => v.id === vizId);

  // Available visualizations not yet in this dashboard
  const availableVizs = allVisualizations.filter(
    (v) => !panels.some((p) => p.visualization_id === v.id)
  );

  if (loading) {
    return (
      <AppShell>
        <AnimatedPage className="space-y-6">
          <div className="flex items-center gap-3">
            <CardSkeleton />
          </div>
          <div className="grid grid-cols-12 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="col-span-6">
                <CardSkeleton />
              </div>
            ))}
          </div>
        </AnimatedPage>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <AnimatedPage>
          <ErrorState message={error} onRetry={fetchDashboard} />
        </AnimatedPage>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AnimatedPage className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/dashboards")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {dashboard?.name || "Dashboard"}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {dashboard?.description ||
                  "Drag and drop panels to arrange your dashboard"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border text-xs"
                onClick={() => setLocked(!locked)}
              >
                {locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <Unlock className="h-3.5 w-3.5" />
                )}
                {locked ? "Locked" : "Unlocked"}
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outline"
                className="gap-2 border"
                onClick={() => setAddPanelOpen(true)}
              >
                <Plus className="h-4 w-4" /> Add Panel
              </Button>
            </motion.div>
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
                    className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save Layout"}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Info bar */}
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-muted text-[10px]">
            {panels.length} {panels.length === 1 ? "panel" : "panels"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            12-column grid
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {locked ? "Drag disabled" : "Drag to rearrange"}
          </Badge>
          {hasChanges && (
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20"
            >
              Unsaved changes
            </Badge>
          )}
        </div>

        {/* Grid Layout */}
        {panels.length === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title="No panels yet"
            description="Add visualization panels to build your dashboard."
            actionLabel="Add Panel"
            onAction={() => setAddPanelOpen(true)}
          />
        ) : (
          <div className="dashboard-grid-wrapper">
            <ResponsiveGridLayout
              className="layout"
              layouts={{ lg: rglLayout }}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={ROW_HEIGHT}
              isDraggable={!locked}
              isResizable={!locked}
              draggableHandle=".drag-handle"
              onLayoutChange={(layout) => handleLayoutChange(layout)}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              useCSSTransforms
              compactType="vertical"
            >
              {panels.map((panel, index) => {
                const vizFull = getViz(panel.visualization_id);
                const vizSummary = getVizSummary(panel.visualization_id);
                const vizName = vizFull?.name || vizSummary?.name || "Unknown";
                const vizBackend = vizFull?.backend || vizSummary?.backend || "";
                const outputType = vizFull?.output_type || vizSummary?.output_type || "svg";
                const renderedOutput = vizFull?.rendered_output || null;

                return (
                  <div key={String(index)}>
                    <GlassCard className="h-full flex flex-col overflow-hidden">
                      {/* Panel header */}
                      <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <GripVertical className="drag-handle h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
                          <span className="text-xs font-medium text-foreground truncate">
                            {vizName}
                          </span>
                          {vizBackend && (
                            <Badge
                              variant="outline"
                              className={`text-[9px] shrink-0 ${
                                backendColors[vizBackend.toLowerCase()] || ""
                              }`}
                            >
                              {vizBackend}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground/40 hover:text-foreground"
                            onClick={() =>
                              router.push(`/visualizations/${panel.visualization_id}`)
                            }
                          >
                            <Maximize2 className="h-3 w-3" />
                          </Button>
                          {!locked && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground/40 hover:text-red-400"
                              onClick={() => handleRemovePanel(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Visualization content */}
                      <div className="flex-1 min-h-0 px-2 pb-2">
                        <div className="h-full rounded-md overflow-hidden bg-black/10">
                          <VizRenderer
                            outputType={outputType}
                            renderedOutput={renderedOutput}
                          />
                        </div>
                      </div>
                    </GlassCard>
                  </div>
                );
              })}
            </ResponsiveGridLayout>
          </div>
        )}

        {/* Add Panel Dialog */}
        <Dialog open={addPanelOpen} onOpenChange={setAddPanelOpen}>
          <DialogContent className="border bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Panel</DialogTitle>
              <DialogDescription>
                Select a visualization to add to the dashboard.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Visualization
                </Label>
                {availableVizs.length === 0 && allVisualizations.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 py-2">
                    No visualizations available. Create one first on the
                    Visualizations page.
                  </p>
                ) : availableVizs.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 py-2">
                    All visualizations are already on this dashboard. You can
                    still add duplicates.
                  </p>
                ) : null}
                <Select
                  value={selectedVizId}
                  onValueChange={setSelectedVizId}
                >
                  <SelectTrigger className="border bg-muted">
                    <SelectValue placeholder="Select visualization" />
                  </SelectTrigger>
                  <SelectContent>
                    {(availableVizs.length > 0
                      ? availableVizs
                      : allVisualizations
                    ).map((viz) => (
                      <SelectItem key={viz.id} value={viz.id}>
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-3 w-3 text-muted-foreground" />
                          {viz.name}
                          <span className="text-[10px] text-muted-foreground/50">
                            ({viz.backend})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Initial Width
                  </Label>
                  <Select value={panelWidth} onValueChange={setPanelWidth}>
                    <SelectTrigger className="border bg-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { label: "3 cols (quarter)", value: "3" },
                        { label: "4 cols (third)", value: "4" },
                        { label: "6 cols (half)", value: "6" },
                        { label: "8 cols (two-thirds)", value: "8" },
                        { label: "12 cols (full)", value: "12" },
                      ].map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Initial Height
                  </Label>
                  <Select value={panelHeight} onValueChange={setPanelHeight}>
                    <SelectTrigger className="border bg-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { label: "1 row (small)", value: "1" },
                        { label: "2 rows (medium)", value: "2" },
                        { label: "3 rows (large)", value: "3" },
                        { label: "4 rows (tall)", value: "4" },
                      ].map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Grid preview */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Preview</Label>
                <div
                  className="grid gap-1 rounded-lg border border-border/50 bg-muted/20 p-3"
                  style={{
                    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                  }}
                >
                  <div
                    className="rounded bg-white/10 border border-white/[0.08] flex items-center justify-center"
                    style={{
                      gridColumn: `span ${Math.min(parseInt(panelWidth) || 6, 12)}`,
                      height: `${(parseInt(panelHeight) || 2) * 28}px`,
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground/50">
                      {panelWidth} x {panelHeight}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                onClick={handleAddPanel}
                disabled={!selectedVizId}
              >
                <Plus className="h-4 w-4" /> Add Panel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AnimatedPage>
    </AppShell>
  );
}
