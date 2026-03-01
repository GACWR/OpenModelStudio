"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ParallelCoordinates } from "@/components/shared/parallel-coordinates";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, Plus, Sparkles, GitCompare, Trophy, ChevronRight, Users, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";

interface Experiment {
  id: string;
  name: string;
  description: string | null;
  experiment_type: string;
  project_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ExperimentRun {
  id: string;
  experiment_id: string;
  job_id: string | null;
  parameters: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  created_at: string;
}

const typeIcons: Record<string, typeof FlaskConical> = {
  manual: FlaskConical,
  automl: Sparkles,
  comparison: GitCompare,
};

const typeColors: Record<string, string> = {
  manual: "#ffffff",
  automl: "#d4d4d4",
  comparison: "#a3a3a3",
};

export default function ExperimentsPage() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [runCounts, setRunCounts] = useState<Record<string, number>>({});
  const [selectedExp, setSelectedExp] = useState<Experiment | null>(null);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const fetchExperiments = async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exps = await api.get<any[]>("/experiments");
      setExperiments(exps);

      // Fetch run counts for each experiment
      const counts: Record<string, number> = {};
      await Promise.all(
        exps.map(async (exp: Experiment) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const expRuns = await api.get<any[]>(`/experiments/${exp.id}/runs`);
            counts[exp.id] = expRuns?.length ?? 0;
          } catch {
            counts[exp.id] = 0;
          }
        })
      );
      setRunCounts(counts);

      // Auto-select first experiment if none selected
      if (exps.length > 0 && !selectedExp) {
        setSelectedExp(exps[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load experiments");
    } finally {
      setLoading(false);
    }
  };

  // Fetch runs when selected experiment changes
  useEffect(() => {
    if (!selectedExp) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    setRunsLoading(true);

    api.get<ExperimentRun[]>(`/experiments/${selectedExp.id}/runs`)
      .then((data) => {
        if (!cancelled) setRuns(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      })
      .finally(() => {
        if (!cancelled) setRunsLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedExp?.id]);

  useEffect(() => {
    fetchExperiments();
    api.get<{ id: string; name: string }[]>("/projects").then(setProjects).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!newProject) { toast.error("Select a project"); return; }
    if (!newName.trim()) { toast.error("Experiment name is required"); return; }
    setSubmitting(true);
    try {
      const body: Record<string, string> = { project_id: newProject, name: newName.trim() };
      if (newDescription.trim()) body.description = newDescription.trim();
      await api.post("/experiments", body);
      toast.success("Experiment created");
      setNewOpen(false); setNewName(""); setNewProject(""); setNewDescription("");
      fetchExperiments();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSubmitting(false); }
  };

  // Derive dynamic columns from run parameters + metrics
  const { paramKeys, metricKeys } = useMemo(() => {
    const pKeys = new Set<string>();
    const mKeys = new Set<string>();
    for (const run of runs) {
      if (run.parameters) Object.keys(run.parameters).forEach((k) => pKeys.add(k));
      if (run.metrics) Object.keys(run.metrics).forEach((k) => mKeys.add(k));
    }
    return { paramKeys: Array.from(pKeys).sort(), metricKeys: Array.from(mKeys).sort() };
  }, [runs]);

  // Find best run by first metric key
  const bestRunId = useMemo(() => {
    if (runs.length === 0 || metricKeys.length === 0) return null;
    const primaryMetric = metricKeys.includes("accuracy") ? "accuracy" : metricKeys[0];
    const isMinimize = primaryMetric === "loss" || primaryMetric.includes("error");
    let best = runs[0];
    for (const run of runs) {
      const val = Number(run.metrics?.[primaryMetric] ?? (isMinimize ? Infinity : -Infinity));
      const bestVal = Number(best.metrics?.[primaryMetric] ?? (isMinimize ? Infinity : -Infinity));
      if (isMinimize ? val < bestVal : val > bestVal) best = run;
    }
    return best.id;
  }, [runs, metricKeys]);

  // Parallel coordinates data
  const parallelData = useMemo(() => {
    const allKeys = [...paramKeys, ...metricKeys];
    return runs.map((r) => {
      const metrics: Record<string, number> = {};
      for (const k of allKeys) {
        const val = r.parameters?.[k] ?? r.metrics?.[k];
        metrics[k] = typeof val === "number" ? val : Number(val) || 0;
      }
      return { id: r.id, name: r.id.substring(0, 8), metrics };
    });
  }, [runs, paramKeys, metricKeys]);

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Experiments</h1>
            <p className="mt-1 text-sm text-muted-foreground">Track, compare, and optimize your training runs</p>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> New Experiment
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card">
              <DialogHeader><DialogTitle>New Experiment</DialogTitle><DialogDescription>Create a new experiment to track and compare runs.</DialogDescription></DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Project</Label>
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
                  <Label className="text-xs text-muted-foreground">Experiment Name</Label>
                  <Input
                    placeholder="e.g. Hyperparameter Sweep #5"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border bg-muted input-glow"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                  <Input
                    placeholder="What are you testing?"
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
                  {submitting ? "Creating..." : "Create Experiment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={fetchExperiments} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : experiments.length === 0 ? (
          <EmptyState icon={FlaskConical} title="No experiments" description="Create your first experiment to start tracking runs." actionLabel="New Experiment" onAction={() => setNewOpen(true)} />
        ) : (
          <>
            {/* Experiment Cards */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {experiments.map((exp) => {
                const Icon = typeIcons[exp.experiment_type] || FlaskConical;
                const color = typeColors[exp.experiment_type] || "#ffffff";
                const count = runCounts[exp.id] ?? 0;
                const isSelected = selectedExp?.id === exp.id;
                return (
                  <motion.div
                    key={exp.id}
                    variants={staggerItem}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <GlassCard
                      className={`cursor-pointer p-5 transition-all duration-200 ${
                        isSelected ? "ring-1 ring-white/20 bg-white/[0.04]" : "hover:bg-white/[0.02]"
                      }`}
                      onClick={() => setSelectedExp(exp)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${color}15` }}>
                            <Icon className="h-5 w-5" style={{ color }} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{exp.name}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {count} {count === 1 ? "run" : "runs"}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-muted text-[10px] capitalize">{exp.experiment_type}</Badge>
                      </div>
                      {exp.description && (
                        <p className="mt-2 text-xs text-muted-foreground/70 line-clamp-2">{exp.description}</p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground/50">
                          {new Date(exp.created_at).toLocaleDateString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/experiments/${exp.id}`);
                          }}
                        >
                          Details <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Selected Experiment Detail */}
            <AnimatePresence mode="wait">
              {selectedExp && (
                <motion.div
                  key={selectedExp.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <Tabs defaultValue="table" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-foreground">{selectedExp.name}</h2>
                        <Badge variant="secondary" className="text-[10px]">{runs.length} runs</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <TabsList className="bg-card/50 border border-border/50">
                          <TabsTrigger value="table" className="gap-1.5 text-xs"><BarChart3 className="h-3 w-3" /> Table</TabsTrigger>
                          <TabsTrigger value="parallel" className="gap-1.5 text-xs"><GitCompare className="h-3 w-3" /> Parallel</TabsTrigger>
                        </TabsList>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => router.push(`/experiments/${selectedExp.id}`)}
                        >
                          Full View <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <TabsContent value="table">
                      {runsLoading ? (
                        <CardSkeleton />
                      ) : runs.length === 0 ? (
                        <Card className="border-border/50 bg-card/50">
                          <CardContent className="p-8">
                            <EmptyState
                              icon={Users}
                              title="No runs yet"
                              description="Add runs via the SDK: openmodelstudio.add_experiment_run(experiment_id, ...)"
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className="border-border/50 bg-card/50">
                          <CardContent className="p-0 overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-border/50">
                                  <TableHead className="w-24">Run</TableHead>
                                  {paramKeys.map((k) => (
                                    <TableHead key={`p-${k}`} className="text-blue-400/70 text-xs">{k}</TableHead>
                                  ))}
                                  {metricKeys.map((k) => (
                                    <TableHead key={`m-${k}`} className="text-emerald-400/70 text-xs">{k}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {runs.map((run) => {
                                  const isBest = run.id === bestRunId;
                                  return (
                                    <TableRow
                                      key={run.id}
                                      className={`border-border/50 transition-colors cursor-pointer hover:bg-white/[0.02] ${
                                        isBest ? "bg-emerald-500/5" : ""
                                      }`}
                                      onClick={() => {
                                        if (run.job_id) router.push(`/training/${run.job_id}`);
                                      }}
                                    >
                                      <TableCell className="font-mono text-white text-xs">
                                        {run.id.substring(0, 8)}
                                        {isBest && <Trophy className="inline h-3 w-3 ml-1 text-amber-400" />}
                                      </TableCell>
                                      {paramKeys.map((k) => (
                                        <TableCell key={`p-${k}`} className="font-mono text-muted-foreground text-xs">
                                          {run.parameters?.[k] != null ? String(run.parameters[k]) : "—"}
                                        </TableCell>
                                      ))}
                                      {metricKeys.map((k) => {
                                        const val = run.metrics?.[k];
                                        return (
                                          <TableCell
                                            key={`m-${k}`}
                                            className={`font-mono text-xs ${
                                              isBest ? "text-emerald-400 font-medium" : "text-muted-foreground"
                                            }`}
                                          >
                                            {val != null ? (typeof val === "number" ? val.toFixed(4) : String(val)) : "—"}
                                          </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    <TabsContent value="parallel">
                      <Card className="border-border/50 bg-card/50">
                        <CardContent className="p-6">
                          {parallelData.length === 0 ? (
                            <EmptyState icon={GitCompare} title="No data to visualize" description="Add runs with parameters and metrics to see parallel coordinates." />
                          ) : (
                            <ParallelCoordinates
                              runs={parallelData}
                              dimensions={[...paramKeys, ...metricKeys]}
                              height={350}
                            />
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
