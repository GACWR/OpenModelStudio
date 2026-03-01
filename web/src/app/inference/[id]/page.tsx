"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedCounter } from "@/components/shared/animated-counter";

import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, Braces, FileCode, Sparkles, AlertTriangle, CheckCircle2, XCircle, Loader2, Copy, Check } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Job {
  id: string;
  project_id: string;
  model_id: string;
  dataset_id: string | null;
  job_type: string;
  status: string;
  k8s_job_name: string | null;
  hardware_tier: string;
  hyperparameters: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  progress: number;
  epoch_current: number | null;
  epoch_total: number | null;
  loss: number | null;
  learning_rate: number | null;
  gpu_config: string | null;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-400" />;
    case "running":
      return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />;
    case "pending":
      return <Clock className="h-5 w-5 text-amber-400" />;
    default:
      return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
  }
}

export default function InferenceDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState("output");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [copied, setCopied] = useState(false);

  const computeElapsed = useCallback((startedAt: string | null, completedAt: string | null): number => {
    if (!startedAt) return 0;
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    return Math.max(0, Math.floor((end - start) / 1000));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: NodeJS.Timeout | null = null;

    async function fetchJob() {
      try {
        const jobRes = await api.get<Job>(`/training/${jobId}`);
        if (cancelled) return;
        setJob(jobRes);
        setElapsedSec(computeElapsed(jobRes.started_at, jobRes.completed_at));

        // Poll if still running
        const isTerminal = ["completed", "failed", "cancelled"].includes(jobRes.status);
        if (!isTerminal && !pollInterval) {
          pollInterval = setInterval(async () => {
            try {
              const updated = await api.get<Job>(`/training/${jobId}`);
              if (!cancelled) {
                setJob(updated);
                setElapsedSec(computeElapsed(updated.started_at, updated.completed_at));
                if (["completed", "failed", "cancelled"].includes(updated.status) && pollInterval) {
                  clearInterval(pollInterval);
                  pollInterval = null;
                }
              }
            } catch { /* ignore poll errors */ }
          }, 3000);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load inference job");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchJob();
    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId, computeElapsed]);

  // Tick elapsed timer every second while job is running
  useEffect(() => {
    if (!job) return;
    const isActive = job.status === "running" || job.status === "pending";
    if (!isActive) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [job]);

  const formatDuration = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    const h = Math.floor(s / 3600);
    return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const handleCopy = () => {
    if (!job?.metrics) return;
    navigator.clipboard.writeText(JSON.stringify(job.metrics, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <AppShell><PageSkeleton /></AppShell>;
  }

  if (!job) {
    return <AppShell><PageSkeleton /></AppShell>;
  }

  const isActive = job.status === "running" || job.status === "pending";
  const progress = job.progress ?? 0;
  const latencyMs = job.started_at && job.completed_at
    ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
    : null;

  // Parse output from metrics field
  const output = job.metrics;
  const hasError = output && ("error" in output);
  const hasPredictions = output && ("predictions" in output);

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/inference">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-foreground">Inference Job</h1>
              <StatusBadge status={job.status} />
              {isActive && <PulseIndicator color="green" size="md" />}
            </div>
            <p className="mt-1 ml-11 text-sm text-muted-foreground font-mono">{job.id}</p>
          </div>
          <div className="flex items-center gap-4">
            {latencyMs != null && (
              <div className="flex items-center gap-2 rounded-lg border bg-card/50 px-4 py-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Latency</span>
                <span className="text-sm font-mono font-bold text-foreground">{latencyMs}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-4">
            <StatusIcon status={job.status} />
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">
                  {job.status === "completed" ? "Inference completed" :
                   job.status === "failed" ? "Inference failed" :
                   job.status === "running" ? "Running inference..." :
                   "Waiting to start..."}
                </span>
                {isActive && <AnimatedCounter value={progress} suffix="%" className="font-medium text-foreground" />}
              </div>
              {isActive && (
                <div className="relative h-2 rounded-full bg-accent overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-white to-neutral-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  />
                  <div className="absolute inset-0 shimmer rounded-full" />
                </div>
              )}
            </div>
            {job.started_at && (
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Duration</span>
                <p className="font-mono text-sm font-bold text-foreground">{formatDuration(elapsedSec)}</p>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Error Banner */}
        {job.error_message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"
          >
            <XCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-300">Error</p>
              <p className="text-sm text-red-300/80 font-mono mt-1">{job.error_message}</p>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card/50 border">
            <TabsTrigger value="output" className="gap-2"><Sparkles className="h-3.5 w-3.5" /> Output</TabsTrigger>
            <TabsTrigger value="input" className="gap-2"><Braces className="h-3.5 w-3.5" /> Input</TabsTrigger>
            <TabsTrigger value="config" className="gap-2"><FileCode className="h-3.5 w-3.5" /> Config</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >

          <TabsContent value="output" forceMount={activeTab === "output" ? true : undefined} className={activeTab !== "output" ? "hidden" : "space-y-4"}>
            {/* Predictions */}
            {hasPredictions && (
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    Predictions
                  </h3>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleCopy}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className="space-y-3"
                >
                  {Array.isArray((output as Record<string, unknown>).predictions) && (
                    <motion.div variants={staggerItem} className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {((output as Record<string, unknown>).predictions as number[]).map((pred, i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: i * 0.05, type: "spring" }}
                          >
                            <Badge variant="outline" className="text-base px-4 py-2 font-mono border-emerald-500/30 bg-emerald-500/5 text-emerald-300">
                              {typeof pred === "number" ? pred.toFixed(4) : String(pred)}
                            </Badge>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Probabilities */}
                  {output && "probabilities" in output && Array.isArray((output as Record<string, unknown>).probabilities) && (
                    <motion.div variants={staggerItem} className="mt-4">
                      <h4 className="text-xs text-muted-foreground mb-2">Class Probabilities</h4>
                      <div className="space-y-2">
                        {((output as Record<string, unknown>).probabilities as number[][]).map((probs, rowIdx) => (
                          <div key={rowIdx} className="flex gap-2">
                            {probs.map((prob, colIdx) => (
                              <div key={colIdx} className="flex-1">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Class {colIdx}</span>
                                  <span className="font-mono text-foreground">{(prob * 100).toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-accent overflow-hidden">
                                  <motion.div
                                    className="h-full rounded-full bg-gradient-to-r from-white/50 to-white"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${prob * 100}%` }}
                                    transition={{ duration: 0.8, delay: colIdx * 0.1 }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </GlassCard>
            )}

            {/* Error output */}
            {hasError && (
              <GlassCard className="p-6">
                <div className="flex items-center gap-2 text-amber-400 mb-3">
                  <AlertTriangle className="h-4 w-4" />
                  <h3 className="text-sm font-medium">Inference Error</h3>
                </div>
                <pre className="rounded-lg bg-background p-4 font-mono text-xs text-red-300 overflow-auto">
                  {JSON.stringify(output, null, 2)}
                </pre>
              </GlassCard>
            )}

            {/* Raw output (for non-prediction outputs) */}
            {output && !hasPredictions && !hasError && (
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Raw Output</h3>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleCopy}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="rounded-lg bg-background p-4 font-mono text-xs text-muted-foreground overflow-auto">
                  {JSON.stringify(output, null, 2)}
                </pre>
              </GlassCard>
            )}

            {/* No output yet */}
            {!output && (
              <Card className="border bg-card/50">
                <CardContent className="p-6">
                  <EmptyState
                    icon={Sparkles}
                    title={isActive ? "Waiting for output..." : "No output"}
                    description={isActive ? "Inference is running. Results will appear here when complete." : "This job did not produce any output."}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="input" forceMount={activeTab === "input" ? true : undefined} className={activeTab !== "input" ? "hidden" : ""}>
            <Card className="border bg-card/50">
              <CardHeader><CardTitle className="text-base">Input Data</CardTitle></CardHeader>
              <CardContent>
                <pre className="rounded-lg bg-background p-4 font-mono text-xs text-muted-foreground overflow-auto">
                  {job.hyperparameters
                    ? JSON.stringify(job.hyperparameters, null, 2)
                    : JSON.stringify({ info: "No input data was provided." }, null, 2)
                  }
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" forceMount={activeTab === "config" ? true : undefined} className={activeTab !== "config" ? "hidden" : ""}>
            <Card className="border bg-card/50">
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border bg-background/50 p-4">
                    <span className="text-xs text-muted-foreground">Job ID</span>
                    <p className="font-mono text-sm text-foreground mt-1">{job.id}</p>
                  </div>
                  <div className="rounded-lg border bg-background/50 p-4">
                    <span className="text-xs text-muted-foreground">Model ID</span>
                    <p className="font-mono text-sm text-foreground mt-1">{job.model_id}</p>
                  </div>
                  <div className="rounded-lg border bg-background/50 p-4">
                    <span className="text-xs text-muted-foreground">Hardware Tier</span>
                    <p className="text-sm text-foreground mt-1">{job.hardware_tier}</p>
                  </div>
                  <div className="rounded-lg border bg-background/50 p-4">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="mt-1"><StatusBadge status={job.status} /></div>
                  </div>
                  <div className="rounded-lg border bg-background/50 p-4">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <p className="text-sm text-foreground mt-1">{new Date(job.created_at).toLocaleString()}</p>
                  </div>
                  {job.completed_at && (
                    <div className="rounded-lg border bg-background/50 p-4">
                      <span className="text-xs text-muted-foreground">Completed</span>
                      <p className="text-sm text-foreground mt-1">{new Date(job.completed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          </motion.div>
          </AnimatePresence>
        </Tabs>
      </AnimatedPage>
    </AppShell>
  );
}
