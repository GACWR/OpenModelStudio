"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { BarChart3, Search, Plus, Clock, Trash2, ChevronRight, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useProjectFilter } from "@/providers/project-filter-provider";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Visualization {
  id: string;
  name: string;
  backend: string;
  output_type: string;
  description: string | null;
  refresh_interval: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse {
  items: Visualization[];
  total: number;
  page: number;
  per_page: number;
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

const BACKENDS = [
  "matplotlib",
  "seaborn",
  "plotly",
  "bokeh",
  "altair",
  "plotnine",
  "datashader",
  "networkx",
  "geopandas",
];

const PER_PAGE = 24;

export default function VisualizationsPage() {
  const router = useRouter();
  const { selectedProjectId } = useProjectFilter();
  const [visualizations, setVisualizations] = useState<Visualization[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBackend, setNewBackend] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRefreshInterval, setNewRefreshInterval] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const fetchVisualizations = useCallback(
    (p: number) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (selectedProjectId) params.set("project_id", selectedProjectId);
      params.set("page", String(p));
      params.set("per_page", String(PER_PAGE));
      const qs = params.toString();
      api
        .get<PaginatedResponse>(`/visualizations?${qs}`)
        .then((resp) => {
          setVisualizations(resp.items);
          setTotal(resp.total);
          setPage(resp.page);
        })
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Failed to load visualizations"
          )
        )
        .finally(() => setLoading(false));
    },
    [selectedProjectId]
  );

  useEffect(() => {
    setPage(1);
    fetchVisualizations(1);
  }, [selectedProjectId, fetchVisualizations]);

  const goToPage = (p: number) => {
    const target = Math.max(1, Math.min(p, totalPages));
    fetchVisualizations(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!newBackend) {
      toast.error("Select a backend");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<{ id: string }>("/visualizations", {
        name: newName.trim(),
        backend: newBackend,
        description: newDescription.trim() || null,
        refresh_interval: parseInt(newRefreshInterval) || 0,
        project_id: selectedProjectId || undefined,
      });
      toast.success("Visualization created");
      setCreateOpen(false);
      setNewName("");
      setNewBackend("");
      setNewDescription("");
      setNewRefreshInterval("0");
      router.push(`/visualizations/${result.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create visualization"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (vizId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(vizId);
    try {
      await api.delete(`/visualizations/${vizId}`);
      toast.success("Visualization deleted");
      setVisualizations(visualizations.filter((v) => v.id !== vizId));
      setTotal((t) => t - 1);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete"
      );
    } finally {
      setDeleting(null);
    }
  };

  const filtered = visualizations.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.description || "").toLowerCase().includes(search.toLowerCase()) ||
      v.backend.toLowerCase().includes(search.toLowerCase())
  );

  function getStatus(v: Visualization): "Published" | "Draft" {
    return v.published ? "Published" : "Draft";
  }

  // Build page number buttons (show max 7 page buttons)
  const pageButtons = (() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  })();

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Visualizations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and manage data visualizations
              {total > 0 && (
                <span className="ml-2 text-muted-foreground/50">
                  ({total} total)
                </span>
              )}
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> New Visualization
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New Visualization</DialogTitle>
                <DialogDescription>
                  Create a new visualization with your preferred backend.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    placeholder="e.g. Training Loss Curve"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border bg-muted input-glow"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Backend
                  </Label>
                  <Select value={newBackend} onValueChange={setNewBackend}>
                    <SelectTrigger className="border bg-muted">
                      <SelectValue placeholder="Select visualization backend" />
                    </SelectTrigger>
                    <SelectContent>
                      {BACKENDS.map((b) => (
                        <SelectItem key={b} value={b}>
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                backendColors[b]
                                  ?.split(" ")[0]
                                  ?.replace("/10", "") || "bg-white/20"
                              }`}
                            />
                            {b.charAt(0).toUpperCase() + b.slice(1)}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Description (optional)
                  </Label>
                  <Input
                    placeholder="What does this visualization show?"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="border bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Refresh Interval (seconds)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0 = static (no auto-refresh)"
                    value={newRefreshInterval}
                    onChange={(e) => setNewRefreshInterval(e.target.value)}
                    className="border bg-muted"
                  />
                  <p className="text-[10px] text-muted-foreground/60">
                    Set to 0 for a static visualization, or enter seconds for
                    auto-refresh.
                  </p>
                </div>
                <Button
                  className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                  onClick={handleCreate}
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create Visualization"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Animated search bar */}
        <motion.div
          animate={{ width: searchFocused ? "100%" : "320px" }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search visualizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="border bg-card/50 pl-10 input-glow transition-all"
          />
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchVisualizations(page)} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No visualizations found"
            description="Create your first visualization to get started."
            actionLabel="New Visualization"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {filtered.map((viz) => {
              const status = getStatus(viz);
              return (
                <motion.div
                  key={viz.id}
                  variants={staggerItem}
                  whileHover={{
                    scale: 1.02,
                    rotateX: 2,
                    rotateY: -2,
                  }}
                  style={{ perspective: 1000 }}
                >
                  <Link href={`/visualizations/${viz.id}`}>
                    <GlassCard className="cursor-pointer p-5 h-full flex flex-col">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                            <BarChart3 className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {viz.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  backendColors[viz.backend.toLowerCase()] || ""
                                }`}
                              >
                                {viz.backend}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            status === "Published"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          <span
                            className={`mr-1.5 h-1.5 w-1.5 rounded-full inline-block ${
                              status === "Published"
                                ? "bg-emerald-400"
                                : "bg-amber-400"
                            }`}
                          />
                          {status}
                        </Badge>
                      </div>

                      {/* Description */}
                      {viz.description && (
                        <p className="mt-3 text-xs text-muted-foreground/80 line-clamp-2 flex-1">
                          {viz.description}
                        </p>
                      )}
                      {!viz.description && <div className="flex-1" />}

                      {/* Footer */}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                          {viz.refresh_interval > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {viz.refresh_interval}s refresh
                            </span>
                          )}
                          <span>
                            {new Date(viz.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground/40 hover:text-red-400"
                            onClick={(e) => handleDelete(viz.id, e)}
                            disabled={deleting === viz.id}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                          >
                            Edit <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </GlassCard>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Pagination */}
        {!loading && !error && total > PER_PAGE && (
          <div className="flex items-center justify-center gap-1 pt-2 pb-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageButtons.map((p, i) =>
              p === "..." ? (
                <span
                  key={`dots-${i}`}
                  className="px-1 text-xs text-muted-foreground/40"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "ghost"}
                  size="icon"
                  className={`h-8 w-8 text-xs ${
                    p === page
                      ? "bg-white text-black hover:bg-white/90"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => goToPage(p)}
                >
                  {p}
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
