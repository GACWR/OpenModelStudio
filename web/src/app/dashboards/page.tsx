"use client";

import { useState, useEffect } from "react";
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
import { LayoutDashboard, Search, Plus, ChevronRight, Layers } from "lucide-react";
import Link from "next/link";
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

interface DashboardLayout {
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
  layout: DashboardLayout[];
  created_at: string;
  updated_at: string;
}

export default function DashboardsPage() {
  const { selectedProjectId } = useProjectFilter();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboards = (projectId: string | null) => {
    setLoading(true);
    setError(null);
    api
      .getFiltered<Dashboard[]>("/dashboards", projectId)
      .then(setDashboards)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load dashboards")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboards(selectedProjectId);
  }, [selectedProjectId]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Dashboard name is required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/dashboards", {
        name: newName.trim(),
        description: newDescription.trim() || null,
        project_id: selectedProjectId || undefined,
      });
      toast.success("Dashboard created");
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      fetchDashboards(selectedProjectId);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create dashboard"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = dashboards.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboards</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and manage custom dashboards with visualization panels
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> New Dashboard
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New Dashboard</DialogTitle>
                <DialogDescription>
                  Create a new dashboard to compose visualization panels.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    placeholder="e.g. Training Overview"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border bg-muted input-glow"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Description (optional)
                  </Label>
                  <Input
                    placeholder="What is this dashboard for?"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="border bg-muted"
                  />
                </div>
                <Button
                  className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                  onClick={handleCreate}
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create Dashboard"}
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
            placeholder="Search dashboards..."
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
          <ErrorState message={error} onRetry={() => fetchDashboards(selectedProjectId)} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title="No dashboards found"
            description="Create your first dashboard to start composing visualizations."
            actionLabel="New Dashboard"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {filtered.map((dashboard) => {
              const panelCount = dashboard.layout?.length || 0;
              return (
                <motion.div
                  key={dashboard.id}
                  variants={staggerItem}
                  whileHover={{
                    scale: 1.02,
                    rotateX: 2,
                    rotateY: -2,
                  }}
                  style={{ perspective: 1000 }}
                >
                  <Link href={`/dashboards/${dashboard.id}`}>
                    <GlassCard className="cursor-pointer p-5 h-full flex flex-col">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                            <LayoutDashboard className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {dashboard.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Layers className="h-3 w-3 text-muted-foreground/60" />
                              <span className="text-[11px] text-muted-foreground/60">
                                {panelCount}{" "}
                                {panelCount === 1 ? "panel" : "panels"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      {dashboard.description && (
                        <p className="mt-3 text-xs text-muted-foreground/80 line-clamp-2 flex-1">
                          {dashboard.description}
                        </p>
                      )}
                      {!dashboard.description && <div className="flex-1" />}

                      {/* Mini grid preview */}
                      {panelCount > 0 && (
                        <div className="mt-3 grid grid-cols-6 gap-0.5 h-8">
                          {dashboard.layout.slice(0, 6).map((panel, idx) => (
                            <div
                              key={idx}
                              className="rounded-sm bg-white/5 border border-white/[0.06]"
                              style={{
                                gridColumn: `span ${Math.min(panel.w || 1, 3)}`,
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="bg-muted text-[10px]"
                          >
                            {panelCount}{" "}
                            {panelCount === 1 ? "panel" : "panels"}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                        >
                          Edit <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </GlassCard>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
