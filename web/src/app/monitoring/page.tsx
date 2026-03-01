"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ProgressRing } from "@/components/shared/progress-ring";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { AnimatedCounter } from "@/components/shared/animated-counter";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { KPISkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { Activity, RefreshCw, ArrowLeft, AlertTriangle, Clock } from "lucide-react";
import { api } from "@/lib/api";

interface ModelStatus {
  id: string;
  name: string;
  version: string;
  status: string;
  latency: number;
  requests24h: number;
  errorRate: number;
  cpu: number;
  memory: number;
  gpu: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEndpoint(e: any): ModelStatus {
  return {
    id: e.id,
    name: e.name,
    version: `${e.replicas}x`,
    status: e.error_rate > 2 ? "degraded" : e.status === "active" ? "healthy" : "unhealthy",
    latency: e.latency_ms || 0,
    requests24h: e.requests_24h || 0,
    errorRate: e.error_rate || 0,
    cpu: Math.round(e.cpu_usage || 0),
    memory: Math.round(e.memory_usage || 0),
    gpu: Math.round(e.gpu_usage || 0),
  };
}



const alertColors: Record<string, string> = {
  info: "border-white/20 bg-white/5 text-neutral-300",
  warn: "border-amber-500/20 bg-amber-500/5 text-amber-300",
  error: "border-red-500/20 bg-red-500/5 text-red-300",
};

export default function MonitoringPage() {
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("24h");

  const fetchData = () => {
    setLoading(true);
    setError(null);
    api.get<any[]>("/monitoring/models")
      .then((data) => setModels(data.map(mapEndpoint)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load monitoring data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const model = models.find((m) => m.id === selected);
  const healthyCount = models.filter((m) => m.status === "healthy").length;
  const healthPct = models.length ? Math.round((healthyCount / models.length) * 100) : 0;

  // Derive alerts dynamically from model data
  const alerts = useMemo(() => {
    const result: { id: string; type: string; msg: string; time: string }[] = [];
    models.forEach((m) => {
      if (m.errorRate > 2) {
        result.push({ id: `err-${m.id}`, type: "error", msg: `Error rate spike on ${m.name} — ${m.errorRate}% (threshold: 2%)`, time: "now" });
      }
      if (m.latency > 500) {
        result.push({ id: `warn-${m.id}`, type: "warn", msg: `High latency on ${m.name} — ${m.latency}ms (threshold: 500ms)`, time: "now" });
      }
      const replicaCount = parseInt(m.version.replace("x", ""), 10);
      if (replicaCount > 1) {
        result.push({ id: `info-${m.id}`, type: "info", msg: `${m.name} scaled to ${replicaCount} replicas`, time: "now" });
      }
    });
    return result;
  }, [models]);

  // Derive pods from models: each model's version "Nx" means N pods
  const pods = useMemo(() => {
    const result: { id: string; modelName: string; status: "green" | "yellow" | "red" }[] = [];
    models.forEach((m) => {
      const replicaCount = parseInt(m.version.replace("x", ""), 10) || 1;
      const color: "green" | "yellow" | "red" =
        m.status === "healthy" ? "green" : m.status === "degraded" ? "yellow" : "red";
      for (let i = 0; i < replicaCount; i++) {
        result.push({ id: `${m.id}-pod-${i}`, modelName: m.name, status: color });
      }
    });
    return result;
  }, [models]);

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selected && (
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Activity className="h-6 w-6 text-white" />
            <h1 className="text-2xl font-bold text-foreground">{model ? model.name : "Model Monitoring"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-24 border bg-card/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1h</SelectItem>
                <SelectItem value="6h">6h</SelectItem>
                <SelectItem value="24h">24h</SelectItem>
                <SelectItem value="7d">7d</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-2 border" onClick={() => { fetchData(); toast.success("Refreshed"); }}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Global Health */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-6">
                <ProgressRing value={healthPct} size={80} strokeWidth={6} color="#10b981">
                  <AnimatedCounter value={healthPct} suffix="%" className="text-lg font-bold text-foreground" />
                </ProgressRing>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">System Health</h2>
                  <p className="text-sm text-muted-foreground">{healthyCount} of {models.length} models healthy</p>
                </div>
              </div>
            </GlassCard>

            {error ? (
              <ErrorState message={error} onRetry={fetchData} />
            ) : loading ? (
              <KPISkeleton />
            ) : models.length === 0 ? (
              <EmptyState icon={Activity} title="No models deployed" description="Deploy a model to start monitoring." />
            ) : (
              <>
                {/* Model Grid */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {models.map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <GlassCard
                        className="cursor-pointer p-5"
                        hoverScale
                        onClick={() => setSelected(m.id)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-semibold text-foreground">{m.name}</p>
                            <p className="text-xs text-muted-foreground/70">v{m.version}</p>
                          </div>
                          <PulseIndicator
                            color={m.status === "healthy" ? "green" : m.status === "degraded" ? "yellow" : "red"}
                            pulse={m.status !== "healthy"}
                            size="md"
                          />
                        </div>
                        <div className="h-3 mt-2 mb-1 rounded-full overflow-hidden bg-accent">
                          <div
                            className={`h-full rounded-full transition-all ${
                              m.latency > 500 ? "bg-gradient-to-r from-red-500 to-red-400" :
                              m.latency > 200 ? "bg-gradient-to-r from-amber-500 to-amber-400" :
                              "bg-gradient-to-r from-white to-neutral-400"
                            }`}
                            style={{ width: `${Math.min((m.latency / 1000) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-2">
                          <span>{m.requests24h.toLocaleString()} req</span>
                          <span>{m.latency}ms</span>
                          <span className={m.errorRate > 2 ? "text-red-400" : ""}>{m.errorRate}% err</span>
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))}
                </div>

                {/* Pod Status Grid */}
                <Card className="border bg-card/50">
                  <CardHeader><CardTitle className="text-base">Pod Status ({pods.length} pods)</CardTitle></CardHeader>
                  <CardContent>
                    {pods.length === 0 ? (
                      <p className="text-sm text-muted-foreground/70">No pods running.</p>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {pods.map((pod, i) => (
                          <motion.div
                            key={pod.id}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: i * 0.03 }}
                            title={pod.modelName}
                            className={`aspect-square rounded-lg border flex items-center justify-center ${
                              pod.status === "green" ? "border-emerald-500/20 bg-emerald-500/5" :
                              pod.status === "yellow" ? "border-amber-500/20 bg-amber-500/5" :
                              "border-red-500/20 bg-red-500/5"
                            }`}
                          >
                            <PulseIndicator color={pod.status} pulse={pod.status !== "green"} />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Alerts */}
                <Card className="border bg-card/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-amber-400" /> Recent Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {alerts.length === 0 ? (
                      <EmptyState icon={AlertTriangle} title="No alerts" description="All models are operating within normal thresholds." />
                    ) : (
                      alerts.map((a) => (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`rounded-lg border p-3 text-sm ${alertColors[a.type]}`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{a.msg}</span>
                            <span className="shrink-0 text-xs opacity-60">{a.time}</span>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>
        ) : model ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-6"
          >
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Avg Latency", value: model.latency, suffix: "ms", color: "#ffffff" },
                { label: "Requests (24h)", value: model.requests24h, color: "#d4d4d4" },
                { label: "Error Rate", value: model.errorRate, suffix: "%", decimals: 1, color: model.errorRate > 2 ? "#ef4444" : "#10b981" },
              ].map((kpi) => (
                <GlassCard key={kpi.label} className="p-5">
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <AnimatedCounter
                    value={kpi.value}
                    suffix={kpi.suffix}
                    decimals={kpi.decimals || 0}
                    className="text-2xl font-bold text-foreground"
                  />
                </GlassCard>
              ))}
            </div>

            {/* Charts — placeholder until monitoring history is enabled */}
            <motion.div
              className="grid gap-4 lg:grid-cols-2"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={staggerItem}>
                <Card className="border bg-card/50">
                  <CardHeader><CardTitle className="text-base">Latency ({timeRange})</CardTitle></CardHeader>
                  <CardContent className="flex items-center justify-center h-64">
                    <EmptyState icon={Clock} title="No historical data" description="Historical time-series data will be available when monitoring history is enabled." />
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={staggerItem}>
                <Card className="border bg-card/50">
                  <CardHeader><CardTitle className="text-base">Throughput ({timeRange})</CardTitle></CardHeader>
                  <CardContent className="flex items-center justify-center h-64">
                    <EmptyState icon={Clock} title="No historical data" description="Historical time-series data will be available when monitoring history is enabled." />
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* GPU/CPU Gauges */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            >
              <GlassCard className="p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Resource Utilization</h3>
                <motion.div
                  className="flex justify-around"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                >
                  {[
                    { label: "CPU", value: model.cpu, color: "#a3a3a3" },
                    { label: "Memory", value: model.memory, color: "#f59e0b" },
                    { label: "GPU", value: model.gpu, color: "#d4d4d4" },
                  ].map((r) => (
                    <motion.div
                      key={r.label}
                      variants={staggerItem}
                      className="flex flex-col items-center gap-2"
                      whileHover={{ scale: 1.1 }}
                    >
                      <ProgressRing value={r.value} size={72} strokeWidth={5} color={r.color}>
                        <span className="text-sm font-bold text-foreground">{r.value}%</span>
                      </ProgressRing>
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                    </motion.div>
                  ))}
                </motion.div>
              </GlassCard>
            </motion.div>

            {/* Drift Detection */}
            {model.status === "degraded" && (
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-amber-300">
                    <AlertTriangle className="h-4 w-4" /> Drift Detection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={AlertTriangle}
                    title="No drift data available"
                    description="Drift detection metrics will appear when monitoring is configured."
                  />
                </CardContent>
              </Card>
            )}
          </motion.div>
        ) : null}
        </AnimatePresence>
      </AnimatedPage>
    </AppShell>
  );
}
