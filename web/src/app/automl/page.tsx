"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ProgressRing } from "@/components/shared/progress-ring";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { Sparkles, Trophy, Clock } from "lucide-react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip } from "recharts";
import { api } from "@/lib/api";

interface Sweep {
  id: string;
  name: string;
  status: string;
  trialsCompleted: number;
  trialsTotal: number;
  bestMetric: number;
  objective: string;
  startedAt: string;
}

interface Trial {
  id: string;
  lr: number;
  batch: number;
  layers: number;
  accuracy: number;
  loss: number;
  duration: string;
  isBest: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSweep(e: any): Sweep {
  return {
    id: e.id,
    name: e.name,
    status: e.status ? e.status.charAt(0).toUpperCase() + e.status.slice(1) : "Active",
    trialsCompleted: e.trials_completed ?? 0,
    trialsTotal: e.trials_total ?? 50,
    bestMetric: e.best_metric ?? 0,
    objective: e.objective || "accuracy",
    startedAt: e.created_at ? new Date(e.created_at).toLocaleDateString() : "—",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTrial(r: any, i: number, all: any[]): Trial {
  const p = r.parameters || {};
  const m = r.metrics || {};
  const acc = m.accuracy || 0;
  const bestAcc = Math.max(...all.map((t: any) => (t.metrics || {}).accuracy || 0));
  return {
    id: r.id,
    lr: p.learning_rate || p.lr || 0,
    batch: p.batch_size || p.batch || 32,
    layers: p.layers || p.n_layers || 4,
    accuracy: acc,
    loss: m.loss || 0,
    duration: "—",
    isBest: acc === bestAcc && acc > 0,
  };
}

export default function AutoMLPage() {
  const [sweeps, setSweeps] = useState<Sweep[]>([]);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchSweeps = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<any[]>("/automl/sweeps").then((d) => d.map(mapSweep)),
      api.get<any[]>("/automl/trials").then((d) => d.map(mapTrial)),
    ]).then(([s, t]) => {
      setSweeps(s);
      setTrials(t);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load AutoML data");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchSweeps(); }, []);

  const handleCreateSweep = async () => {
    if (!newName.trim()) { toast.error("Sweep name is required"); return; }
    setSubmitting(true);
    try {
      await api.post("/experiments", { name: newName.trim(), type: "automl" });
      toast.success("Sweep created");
      setNewOpen(false); setNewName("");
      fetchSweeps();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to create sweep"); }
    finally { setSubmitting(false); }
  };

  const scatterData = trials.map((t) => ({ x: t.lr * 10000, y: t.accuracy, isBest: t.isBest }));

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AutoML</h1>
            <p className="mt-1 text-sm text-muted-foreground">Automated hyperparameter optimization and architecture search</p>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Sparkles className="h-4 w-4" /> New Sweep
                </Button>
              </motion.div>
            </DialogTrigger>
            <AnimatePresence>
              {newOpen && (
                <DialogContent className="border bg-card" forceMount>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <DialogHeader><DialogTitle>New AutoML Sweep</DialogTitle><DialogDescription>Configure and launch an automated hyperparameter search.</DialogDescription></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Sweep Name</Label>
                        <Input
                          placeholder="e.g. ResNet Hyperparameter Search"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="border bg-muted input-glow"
                        />
                      </div>
                      <Button
                        className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                        onClick={handleCreateSweep}
                        disabled={submitting}
                      >
                        {submitting ? "Creating..." : "Create Sweep"}
                      </Button>
                    </div>
                  </motion.div>
                </DialogContent>
              )}
            </AnimatePresence>
          </Dialog>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={fetchSweeps} />
        ) : loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : sweeps.length === 0 ? (
          <EmptyState icon={Sparkles} title="No sweeps yet" description="Create your first AutoML sweep to optimize hyperparameters automatically." actionLabel="New Sweep" onAction={() => setNewOpen(true)} />
        ) : (
          <>
            {/* Sweep Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sweeps.map((sweep, i) => (
                <motion.div key={sweep.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ scale: 1.02, y: -2 }}>
                  <GlassCard className="p-5">
                    <div className="flex items-start gap-4">
                      <ProgressRing
                        value={(sweep.trialsCompleted / sweep.trialsTotal) * 100}
                        size={64}
                        strokeWidth={4}
                        color={sweep.status === "Running" ? "#d4d4d4" : "#10b981"}
                      >
                        <span className="text-[10px] font-bold text-foreground">
                          {sweep.trialsCompleted}/{sweep.trialsTotal}
                        </span>
                      </ProgressRing>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{sweep.name}</h3>
                          {sweep.status === "Running" && <PulseIndicator color="purple" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Objective: {sweep.objective} · Best: <span className="text-emerald-400 font-mono">{sweep.bestMetric}</span>
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant={sweep.status === "Running" ? "default" : "secondary"} className={sweep.status === "Running" ? "bg-white/8 text-neutral-300 border-white/15" : "bg-muted"}>
                            {sweep.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {sweep.startedAt}
                          </span>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* Scatter visualization */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader><CardTitle className="text-base">Trial Results — LR vs Accuracy</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <XAxis dataKey="x" name="LR (×1e-4)" stroke="#475569" fontSize={10} />
                    <YAxis dataKey="y" name="Accuracy" stroke="#475569" fontSize={10} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                    <Scatter data={scatterData.filter((d) => !d.isBest)} fill="#ffffff" fillOpacity={0.6} />
                    <Scatter data={scatterData.filter((d) => d.isBest)} fill="#f59e0b" fillOpacity={1} />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Trials table */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader><CardTitle className="text-base">All Trials</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead>Trial</TableHead>
                      <TableHead>LR</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Layers</TableHead>
                      <TableHead>Accuracy</TableHead>
                      <TableHead>Loss</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
                    {trials.map((trial) => (
                      <motion.tr
                        key={trial.id}
                        variants={staggerItem}
                        className={`border-b border-border/50 ${trial.isBest ? "bg-amber-500/5" : ""}`}
                      >
                        <TableCell className="font-mono text-sm">
                          #{trial.id}
                          {trial.isBest && <Trophy className="inline h-3 w-3 ml-1 text-amber-400" />}
                        </TableCell>
                        <TableCell className="font-mono text-foreground">{trial.lr}</TableCell>
                        <TableCell>{trial.batch}</TableCell>
                        <TableCell>{trial.layers}</TableCell>
                        <TableCell className={trial.isBest ? "text-emerald-400 font-medium" : "text-foreground"}>{trial.accuracy}</TableCell>
                        <TableCell className="text-muted-foreground">{trial.loss}</TableCell>
                        <TableCell className="text-muted-foreground">{trial.duration}</TableCell>
                      </motion.tr>
                    ))}
                  </motion.tbody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
