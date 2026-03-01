"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ParallelCoordinates } from "@/components/shared/parallel-coordinates";

import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, FlaskConical, Trophy, BarChart3, GitCompare,
  TrendingUp, Users, Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

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

interface MetricRecord {
  id: string;
  job_id: string;
  metric_name: string;
  value: number;
  step: number | null;
  epoch: number | null;
  recorded_at: string;
}

const RUN_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
];

export default function ExperimentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const experimentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [activeTab, setActiveTab] = useState("runs");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [metricTimeSeries, setMetricTimeSeries] = useState<Record<string, MetricRecord[]>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [exp, expRuns] = await Promise.all([
          api.get<Experiment>(`/experiments/${experimentId}`),
          api.get<ExperimentRun[]>(`/experiments/${experimentId}/runs`),
        ]);
        if (cancelled) return;
        setExperiment(exp);
        setRuns(expRuns ?? []);

        // Fetch time-series metrics for each run that has a job_id
        const jobIds = (expRuns ?? []).filter((r) => r.job_id).map((r) => r.job_id!);
        const uniqueJobIds = [...new Set(jobIds)];
        const metricsMap: Record<string, MetricRecord[]> = {};
        await Promise.all(
          uniqueJobIds.map(async (jid) => {
            try {
              const data = await api.get<MetricRecord[]>(`/training/${jid}/metrics`);
              metricsMap[jid] = data ?? [];
            } catch {
              metricsMap[jid] = [];
            }
          })
        );
        if (!cancelled) setMetricTimeSeries(metricsMap);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load experiment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [experimentId]);

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

  // Best run
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
    return runs.map((r, i) => {
      const metrics: Record<string, number> = {};
      for (const k of allKeys) {
        const val = r.parameters?.[k] ?? r.metrics?.[k];
        metrics[k] = typeof val === "number" ? val : Number(val) || 0;
      }
      return { id: r.id, name: r.id.substring(0, 8), metrics, color: RUN_COLORS[i % RUN_COLORS.length] };
    });
  }, [runs, paramKeys, metricKeys]);

  // Aggregate time-series metrics by metric_name for overlay chart
  const metricCurves = useMemo(() => {
    const allMetricNames = new Set<string>();
    for (const records of Object.values(metricTimeSeries)) {
      for (const r of records) {
        if (r.metric_name !== "progress") allMetricNames.add(r.metric_name);
      }
    }

    const curves: Record<string, { chartData: Record<string, string | number>[]; runLabels: string[] }> = {};

    for (const metricName of allMetricNames) {
      // Collect points per run
      const runData: { label: string; points: { step: number; value: number }[] }[] = [];
      for (const run of runs) {
        if (!run.job_id || !metricTimeSeries[run.job_id]) continue;
        const points = metricTimeSeries[run.job_id]
          .filter((m) => m.metric_name === metricName)
          .map((m) => ({ step: m.epoch ?? m.step ?? 0, value: m.value }))
          .sort((a, b) => a.step - b.step);
        if (points.length > 0) {
          runData.push({ label: run.id.substring(0, 8), points });
        }
      }

      if (runData.length === 0) continue;

      // Merge into a single dataset
      const allSteps = new Set<number>();
      for (const rd of runData) {
        for (const p of rd.points) allSteps.add(p.step);
      }
      const sortedSteps = Array.from(allSteps).sort((a, b) => a - b);

      const chartData = sortedSteps.map((step) => {
        const row: Record<string, string | number> = { step: String(step) };
        for (const rd of runData) {
          const match = rd.points.find((p) => p.step === step);
          if (match) row[rd.label] = match.value;
        }
        return row;
      });

      curves[metricName] = {
        chartData,
        runLabels: runData.map((rd) => rd.label),
      };
    }
    return curves;
  }, [runs, metricTimeSeries]);

  const handleDelete = async () => {
    try {
      await api.delete(`/experiments/${experimentId}`);
      toast.success("Experiment deleted");
      router.push("/experiments");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
    setDeleteOpen(false);
  };

  if (loading) {
    return <AppShell><PageSkeleton /></AppShell>;
  }

  if (!experiment) {
    return (
      <AppShell>
        <AnimatedPage>
          <EmptyState icon={FlaskConical} title="Experiment not found" description="This experiment may have been deleted." />
        </AnimatedPage>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/experiments">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-foreground">{experiment.name}</h1>
              <Badge variant="secondary" className="text-[10px] capitalize">{experiment.experiment_type}</Badge>
              <Badge variant="outline" className="text-[10px]">{runs.length} runs</Badge>
            </div>
            {experiment.description && (
              <p className="mt-1 ml-11 text-sm text-muted-foreground">{experiment.description}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-red-400 border-red-500/20 hover:bg-red-500/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>

        {/* Summary stats */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <motion.div variants={staggerItem}>
            <GlassCard className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{runs.length}</p>
            </GlassCard>
          </motion.div>
          <motion.div variants={staggerItem}>
            <GlassCard className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Parameters</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{paramKeys.length}</p>
            </GlassCard>
          </motion.div>
          <motion.div variants={staggerItem}>
            <GlassCard className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Metrics</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{metricKeys.length}</p>
            </GlassCard>
          </motion.div>
          <motion.div variants={staggerItem}>
            <GlassCard className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Created</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {new Date(experiment.created_at).toLocaleDateString()}
              </p>
            </GlassCard>
          </motion.div>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card/50 border">
            <TabsTrigger value="runs" className="gap-2 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Runs</TabsTrigger>
            <TabsTrigger value="parallel" className="gap-2 text-xs"><GitCompare className="h-3.5 w-3.5" /> Parallel Coordinates</TabsTrigger>
            <TabsTrigger value="curves" className="gap-2 text-xs"><TrendingUp className="h-3.5 w-3.5" /> Metric Curves</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >

              {/* Runs Table */}
              <TabsContent value="runs" forceMount={activeTab === "runs" ? true : undefined} className={activeTab !== "runs" ? "hidden" : ""}>
                {runs.length === 0 ? (
                  <Card className="border bg-card/50">
                    <CardContent className="p-8">
                      <EmptyState
                        icon={Users}
                        title="No runs yet"
                        description="Add runs via the SDK: openmodelstudio.add_experiment_run(experiment_id, job_id=..., parameters={...}, metrics={...})"
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border bg-card/50">
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50">
                            <TableHead className="w-24 text-xs">Run</TableHead>
                            <TableHead className="w-20 text-xs">Job</TableHead>
                            {paramKeys.map((k) => (
                              <TableHead key={`p-${k}`} className="text-xs">
                                <span className="text-blue-400/80">{k}</span>
                              </TableHead>
                            ))}
                            {metricKeys.map((k) => (
                              <TableHead key={`m-${k}`} className="text-xs">
                                <span className="text-emerald-400/80">{k}</span>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runs.map((run, i) => {
                            const isBest = run.id === bestRunId;
                            return (
                              <motion.tr
                                key={run.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                                className={`border-b border-border/50 transition-colors cursor-pointer hover:bg-white/[0.02] ${
                                  isBest ? "bg-emerald-500/[0.04]" : ""
                                }`}
                                onClick={() => {
                                  if (run.job_id) router.push(`/training/${run.job_id}`);
                                }}
                              >
                                <TableCell className="font-mono text-white text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: RUN_COLORS[i % RUN_COLORS.length] }} />
                                    {run.id.substring(0, 8)}
                                    {isBest && <Trophy className="h-3 w-3 text-amber-400" />}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-muted-foreground/50 text-[10px]">
                                  {run.job_id ? run.job_id.substring(0, 8) : "—"}
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
                              </motion.tr>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Parallel Coordinates */}
              <TabsContent value="parallel" forceMount={activeTab === "parallel" ? true : undefined} className={activeTab !== "parallel" ? "hidden" : ""}>
                <Card className="border bg-card/50">
                  <CardContent className="p-6">
                    {parallelData.length === 0 ? (
                      <EmptyState icon={GitCompare} title="No data to visualize" description="Add runs with parameters and metrics." />
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-3 mb-4">
                          {parallelData.map((r) => (
                            <div key={r.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                              {r.name}
                            </div>
                          ))}
                        </div>
                        <ParallelCoordinates
                          runs={parallelData}
                          dimensions={[...paramKeys, ...metricKeys]}
                          height={400}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Metric Curves */}
              <TabsContent value="curves" forceMount={activeTab === "curves" ? true : undefined} className={activeTab !== "curves" ? "hidden" : ""}>
                {Object.keys(metricCurves).length === 0 ? (
                  <Card className="border bg-card/50">
                    <CardContent className="p-8">
                      <EmptyState
                        icon={TrendingUp}
                        title="No time-series data"
                        description="Metric curves appear when runs have associated training jobs with logged metrics."
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {Object.entries(metricCurves).map(([metricName, { chartData, runLabels }], idx) => (
                      <motion.div
                        key={metricName}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                      >
                        <Card className="border bg-card/50">
                          <CardHeader>
                            <CardTitle className="text-base capitalize">{metricName}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={280}>
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                                <XAxis dataKey="step" stroke="#525252" fontSize={11} label={{ value: "Epoch", position: "insideBottom", offset: -5, fill: "#525252" }} />
                                <YAxis stroke="#525252" fontSize={11} />
                                <Tooltip
                                  contentStyle={{
                                    background: "#0a0a0a",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "8px",
                                    color: "#e5e5e5",
                                  }}
                                />
                                <Legend />
                                {runLabels.map((label, i) => {
                                  const runIdx = runs.findIndex((r) => r.id.substring(0, 8) === label);
                                  const color = RUN_COLORS[(runIdx >= 0 ? runIdx : i) % RUN_COLORS.length];
                                  return (
                                    <Line
                                      key={label}
                                      type="monotone"
                                      dataKey={label}
                                      stroke={color}
                                      strokeWidth={2}
                                      dot={false}
                                      connectNulls
                                    />
                                  );
                                })}
                              </LineChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

            </motion.div>
          </AnimatePresence>
        </Tabs>

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete Experiment?"
          description="This will permanently delete this experiment and all its runs. This action cannot be undone."
          confirmLabel="Delete Experiment"
          variant="danger"
          onConfirm={handleDelete}
        />
      </AnimatedPage>
    </AppShell>
  );
}
