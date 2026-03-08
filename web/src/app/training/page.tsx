"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { ProgressRing } from "@/components/shared/progress-ring";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { GlassCard } from "@/components/shared/glass-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Play, Plus, Pause, Square } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useProjectFilter } from "@/providers/project-filter-provider";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TrainingJob {
  id: string;
  name: string;
  model: string;
  jobType: string;
  status: string;
  progress: number;
  epoch: string;
  loss: string;
  lr: string;
  gpu: string;
  duration: string;
  started: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeSince(date: string | null): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function duration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = Math.max(0, endTime - new Date(start).getTime());
  const totalSec = Math.floor(diff / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJob(j: any): TrainingJob {
  return {
    id: j.id,
    name: `${j.job_type} — ${j.hardware_tier}`,
    model: j.model_id?.substring(0, 8) || "—",
    jobType: j.job_type || "training",
    status: capitalize(j.status),
    progress: j.progress || 0,
    epoch: j.epoch_current != null && j.epoch_total != null ? `${j.epoch_current}/${j.epoch_total}` : "—",
    loss: j.loss != null ? j.loss.toFixed(4) : "—",
    lr: j.learning_rate != null ? j.learning_rate.toExponential(0) : "—",
    gpu: j.gpu_config || j.hardware_tier,
    duration: duration(j.started_at, j.completed_at),
    started: timeSince(j.started_at || j.created_at),
  };
}

const statusColors: Record<string, string> = {
  Running: "#10b981",
  Pending: "#f59e0b",
  Completed: "#d4d4d4",
  Failed: "#ef4444",
};

export default function TrainingPage() {
  const { selectedProjectId } = useProjectFilter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawJobs, setRawJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stopJobId, setStopJobId] = useState<string | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newJobTier, setNewJobTier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [models, setModels] = useState<{ id: string; name: string; framework: string }[]>([]);
  const [, setTick] = useState(0); // force re-render for live durations

  const fetchJobs = (initial = false) => {
    if (initial) { setLoading(true); setError(null); }
    api.getFiltered<any[]>("/training/jobs", selectedProjectId)
      .then((data) => setRawJobs(data))
      .catch((err) => { if (initial) setError(err instanceof Error ? err.message : "Failed to load training jobs"); })
      .finally(() => { if (initial) setLoading(false); });
  };

  // Map raw jobs on every render so Date.now() stays fresh for running-job durations
  const jobs = rawJobs.map(mapJob);

  useEffect(() => {
    fetchJobs(true);
    api.getFiltered<{ id: string; name: string; framework: string }[]>("/models", selectedProjectId).then(setModels).catch(() => {});
  }, [selectedProjectId]);

  // Poll every 5s when there are active jobs + tick every second for live durations
  const hasActiveJobs = rawJobs.some((j: any) => j.status === "running" || j.status === "pending");

  useEffect(() => {
    if (!hasActiveJobs) return;
    const poll = setInterval(() => fetchJobs(false), 5000);
    const tick = setInterval(() => setTick(t => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [hasActiveJobs, selectedProjectId]);

  const handleNewJob = async () => {
    if (!newModelId) { toast.error("Select a model"); return; }
    setSubmitting(true);
    try {
      await api.post("/training/start", { model_id: newModelId, hardware_tier: newJobTier || "cpu-small" });
      toast.success("Training job started");
      setNewJobOpen(false);
      setNewModelId(""); setNewJobTier("");
      fetchJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start job");
    } finally {
      setSubmitting(false);
    }
  };

  const statusCounts = jobs.reduce(
    (acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
            <p className="mt-1 text-sm text-muted-foreground">Monitor and manage training &amp; inference jobs</p>
          </div>
          <Dialog open={newJobOpen} onOpenChange={setNewJobOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> New Training Job
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Training Job</DialogTitle>
                <DialogDescription>Configure and submit a new training job.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={newModelId} onValueChange={setNewModelId}>
                    <SelectTrigger className="border bg-muted">
                      <SelectValue placeholder="Select a model to train" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} ({m.framework})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hardware Tier</Label>
                  <Select value={newJobTier} onValueChange={setNewJobTier}>
                    <SelectTrigger className="border bg-muted">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpu-small">CPU Small (4 cores, 16GB)</SelectItem>
                      <SelectItem value="cpu-large">CPU Large (16 cores, 64GB)</SelectItem>
                      <SelectItem value="gpu-small">GPU Small (1x A100)</SelectItem>
                      <SelectItem value="gpu-large">GPU Large (4x A100)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full bg-white text-black hover:bg-white/90" onClick={handleNewJob} disabled={submitting}>
                  {submitting ? "Starting..." : "Start Training"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Running", color: "#10b981", pulseColor: "green" as const },
            { label: "Pending", color: "#f59e0b", pulseColor: "yellow" as const },
            { label: "Completed", color: "#d4d4d4", pulseColor: "blue" as const },
            { label: "Failed", color: "#ef4444", pulseColor: "red" as const },
          ].map((s) => (
            <GlassCard key={s.label} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PulseIndicator color={s.pulseColor} pulse={s.label === "Running"} />
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                </div>
                <AnimatedCounter value={statusCounts[s.label] || 0} className={`text-2xl font-bold`} />
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Jobs list */}
        {error ? (
          <ErrorState message={error} onRetry={fetchJobs} />
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={Play} title="No training jobs" description="Start your first training job to begin." actionLabel="Start Training" onAction={() => setNewJobOpen(true)} />
        ) : (
          <div className="space-y-3">
            {jobs.map((job, i) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link href={job.jobType === "inference" ? `/inference/${job.id}` : `/training/${job.id}`}>
                  <GlassCard className="cursor-pointer p-5">
                    <div className="flex items-center gap-4">
                      {/* Progress Ring */}
                      <ProgressRing
                        value={job.progress}
                        size={56}
                        strokeWidth={4}
                        color={statusColors[job.status] || "#ffffff"}
                      >
                        <span className="text-[11px] font-bold text-foreground">{job.progress}%</span>
                      </ProgressRing>

                      {/* Job Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground truncate">{job.name}</h3>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${job.jobType === "inference" ? "border-blue-500/30 text-blue-400" : "border-emerald-500/30 text-emerald-400"}`}>
                            {job.jobType}
                          </Badge>
                          {job.status === "Running" && <PulseIndicator color="green" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{job.model} · {job.gpu}</p>
                      </div>

                      {/* Metrics */}
                      <div className="hidden md:flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Epoch</p>
                          <p className="text-sm font-mono text-foreground">{job.epoch}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Loss</p>
                          <p className="text-sm font-mono text-foreground">{job.loss}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
                          <p className="text-sm text-foreground">{job.duration}</p>
                        </div>
                      </div>

                      <StatusBadge status={job.status} />

                      {/* Controls */}
                      {job.status === "Running" && (
                        <div className="flex gap-1" onClick={(e) => e.preventDefault()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-amber-400"
                            onClick={(e) => { e.preventDefault(); api.post(`/training/${job.id}/cancel`, {}).then(() => { toast.success("Job paused"); fetchJobs(); }).catch(() => toast.error("Failed to pause")); }}>
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                            onClick={(e) => { e.preventDefault(); setStopJobId(job.id); }}
                          >
                            <Square className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={!!stopJobId}
          onOpenChange={() => setStopJobId(null)}
          title="Stop Training Job?"
          description="This will immediately stop the training run. You can restart it later."
          confirmLabel="Stop Job"
          variant="danger"
          onConfirm={() => {
            api.post(`/training/${stopJobId}/cancel`, {}).then(() => { toast.success("Job stopped"); fetchJobs(); }).catch(() => toast.error("Failed to stop job"));
            setStopJobId(null);
          }}
        />
      </AnimatedPage>
    </AppShell>
  );
}
