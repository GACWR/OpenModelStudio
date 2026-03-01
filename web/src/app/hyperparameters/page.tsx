"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, Plus, FolderKanban, Brain, Clock, Hash, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

interface HyperparameterSet {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  projectId: string | null;
  projectName: string;
  modelId: string | null;
  modelName: string;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSet(h: any, projects: Map<string, string>, models: Map<string, string>): HyperparameterSet {
  return {
    id: h.id,
    name: h.name,
    description: h.description || "",
    parameters: h.parameters || {},
    projectId: h.project_id,
    projectName: h.project_id ? (projects.get(h.project_id) || h.project_id.substring(0, 8)) : "",
    modelId: h.model_id,
    modelName: h.model_id ? (models.get(h.model_id) || h.model_id.substring(0, 8)) : "",
    createdAt: h.created_at || h.updated_at || "",
    updatedAt: h.updated_at || "",
  };
}

function timeSince(date: string): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function HyperparametersPage() {
  const [sets, setSets] = useState<HyperparameterSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newParams, setNewParams] = useState('{\n  "learning_rate": 0.001,\n  "batch_size": 32,\n  "epochs": 10\n}');
  const [submitting, setSubmitting] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [_models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchSets = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<{ id: string; name: string }[]>("/projects"),
      api.get<{ id: string; name: string }[]>("/models"),
    ]).then(([p, m]) => {
      setProjects(p);
      setModels(m);
      const projectMap = new Map(p.map((x) => [x.id, x.name]));
      const modelMap = new Map(m.map((x) => [x.id, x.name]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return api.get<any[]>("/sdk/hyperparameters").then((data) =>
        setSets(data.map((h) => mapSet(h, projectMap, modelMap)))
      );
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load hyperparameter sets");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchSets(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Name is required"); return; }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(newParams);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) throw new Error();
    } catch {
      toast.error("Parameters must be valid JSON object");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/sdk/hyperparameters", {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        parameters: parsed,
        project_id: newProject || undefined,
      });
      toast.success("Hyperparameter set created");
      setNewOpen(false);
      setNewName("");
      setNewDescription("");
      setNewProject("");
      setNewParams('{\n  "learning_rate": 0.001,\n  "batch_size": 32,\n  "epochs": 10\n}');
      fetchSets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    api.delete(`/sdk/hyperparameters/${id}`)
      .then(() => { toast.success("Hyperparameter set deleted"); fetchSets(); })
      .catch(() => toast.error("Failed to delete"));
    setDeleteId(null);
  };

  const linkedToModels = sets.filter((s) => s.modelId).length;
  const distinctProjects = new Set(sets.filter((s) => s.projectId).map((s) => s.projectId)).size;
  const recentCount = sets.filter((s) => {
    if (!s.createdAt) return false;
    return Date.now() - new Date(s.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Hyperparameters</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage and track hyperparameter configurations across experiments</p>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> New Set
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card">
              <DialogHeader>
                <DialogTitle>New Hyperparameter Set</DialogTitle>
                <DialogDescription>Define a named set of hyperparameters for training jobs.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    placeholder="e.g. rf-tuned-v1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border bg-muted input-glow"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                  <Input
                    placeholder="e.g. Tuned RF config for Titanic dataset"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="border bg-muted input-glow"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Project (optional)</Label>
                  <Select value={newProject} onValueChange={setNewProject}>
                    <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Parameters (JSON)</Label>
                  <Textarea
                    value={newParams}
                    onChange={(e) => setNewParams(e.target.value)}
                    className="border bg-muted input-glow font-mono text-sm min-h-[120px]"
                    placeholder='{"learning_rate": 0.001, "batch_size": 32}'
                  />
                </div>
                <Button
                  className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                  onClick={handleCreate}
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create Set"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary KPIs */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total Sets", value: sets.length, color: "#ffffff", icon: SlidersHorizontal },
            { label: "Linked to Models", value: linkedToModels, color: "#d4d4d4", icon: Brain },
            { label: "Projects", value: distinctProjects, color: "#f59e0b", icon: FolderKanban },
            { label: "Recent (7d)", value: recentCount, color: "#10b981", icon: Clock },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <motion.div key={kpi.label} variants={staggerItem}>
                <GlassCard className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${kpi.color}15` }}>
                      <Icon className="h-4 w-4" style={{ color: kpi.color }} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <AnimatedCounter value={kpi.value} className="text-xl font-bold text-foreground" />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Main Content */}
        {error ? (
          <ErrorState message={error} onRetry={fetchSets} />
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : sets.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="No hyperparameter sets"
            description="Create hyperparameter sets here or from a JupyterLab notebook using the SDK."
            actionLabel="New Set"
            onAction={() => setNewOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {sets.map((set, i) => {
              const paramKeys = Object.keys(set.parameters);
              const isExpanded = expandedId === set.id;
              return (
                <motion.div
                  key={set.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GlassCard className="p-5">
                    <div
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : set.id)}
                    >
                      {/* Expand icon */}
                      <div className="text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground truncate">{set.name}</h3>
                          <Badge variant="secondary" className="bg-muted text-[10px] font-mono">
                            <Hash className="h-2.5 w-2.5 mr-0.5" />
                            {paramKeys.length} param{paramKeys.length !== 1 ? "s" : ""}
                          </Badge>
                          {set.modelName && (
                            <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-[10px]">
                              <Brain className="h-2.5 w-2.5 mr-0.5" />
                              {set.modelName}
                            </Badge>
                          )}
                          {set.projectName && (
                            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                              <FolderKanban className="h-2.5 w-2.5 mr-0.5" />
                              {set.projectName}
                            </Badge>
                          )}
                        </div>
                        {set.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">{set.description}</p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-xs text-muted-foreground/70 hidden sm:block">{timeSince(set.createdAt)}</span>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-400 shrink-0"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(set.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Expanded: parameter table */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-border/50">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {paramKeys.map((key) => (
                                <div key={key} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                                  <span className="text-xs font-mono text-muted-foreground">{key}</span>
                                  <span className="text-sm font-mono font-medium text-foreground">{formatParamValue(set.parameters[key])}</span>
                                </div>
                              ))}
                            </div>
                            {paramKeys.length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-2">No parameters defined</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}

        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={() => setDeleteId(null)}
          title="Delete Hyperparameter Set?"
          description="This will permanently remove this hyperparameter configuration. Training jobs that used it will not be affected."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deleteId && handleDelete(deleteId)}
        />
      </AnimatedPage>
    </AppShell>
  );
}
