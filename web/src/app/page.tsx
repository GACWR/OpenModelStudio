"use client";

import { useState, useEffect, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { GlassCard } from "@/components/shared/glass-card";
import { MetricChart } from "@/components/shared/metric-chart";
import { ProgressRing } from "@/components/shared/progress-ring";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { KPISkeleton, CardSkeleton } from "@/components/shared/loading-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { TimelineEvent } from "@/components/shared/timeline-event";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  FolderKanban,
  Play,
  Cloud,
  Database,
  Plus,
  Terminal,
  Zap,
  ArrowRight,
  Activity,
  HardDrive,
  Cpu,
  MemoryStick,
  Gauge,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useProjectFilter } from "@/providers/project-filter-provider";

interface DashboardStats {
  total_projects: number;
  active_training: number;
  models_deployed: number;
  total_datasets: number;
}

interface ActivityItem {
  user: string;
  action: string;
  target: string;
  timestamp: string;
}

interface Job {
  id: string;
  name: string;
  status: string;
  progress: number;
  model: string;
}

const kpiConfig = [
  { key: "total_projects" as const, title: "Total Projects", icon: FolderKanban, color: "#ffffff" },
  { key: "active_training" as const, title: "Active Training", icon: Play, color: "#d4d4d4" },
  { key: "models_deployed" as const, title: "Models Deployed", icon: Cloud, color: "#a3a3a3" },
  { key: "total_datasets" as const, title: "Datasets", icon: Database, color: "#737373" },
];

const DONUT_COLORS = ["#e5e5e5", "#a3a3a3", "#737373", "#525252"];

const platformMetrics = [
  { label: "Storage", icon: HardDrive, value: 24, color: "#e5e5e5" },
  { label: "Compute", icon: Cpu, value: 12, color: "#a3a3a3" },
  { label: "GPU Utilization", icon: Gauge, value: 0, color: "#737373" },
  { label: "Memory", icon: MemoryStick, value: 38, color: "#525252" },
];

function generateSparkline(stats: DashboardStats): Array<{ name: string; value: number }> {
  const total = stats.total_projects + stats.models_deployed + stats.total_datasets + stats.active_training;
  const base = Math.max(total, 1);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Deterministic variation based on day index
  return days.map((name, i) => ({
    name,
    value: Math.max(0, Math.round(base * (0.5 + (i * 0.12) + (i % 3 === 0 ? 0.2 : 0)))),
  }));
}

export default function DashboardPage() {
  const { selectedProjectId } = useProjectFilter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<any[]>("/projects").catch(() => []),
      api.getFiltered<any[]>("/training/jobs", selectedProjectId).catch(() => []),
      api.getFiltered<any[]>("/models", selectedProjectId).catch(() => []),
      api.getFiltered<any[]>("/datasets", selectedProjectId).catch(() => []),
      api.get<any[]>("/notifications").catch(() => []),
    ]).then(([projects, trainingJobs, models, datasets, notifications]) => {
      const activeJobs = (trainingJobs || []).filter((j: any) => j.status === "running" || j.status === "pending");
      setStats({
        total_projects: selectedProjectId ? 1 : (projects || []).length,
        active_training: activeJobs.length,
        models_deployed: (models || []).length,
        total_datasets: (datasets || []).length,
      });
      setActivity(
        (notifications || []).slice(0, 5).map((n: any) => ({
          user: "System",
          action: n.title || n.action || "",
          target: n.message || "",
          timestamp: n.created_at || new Date().toISOString(),
        }))
      );
      setJobs(
        activeJobs.slice(0, 5).map((j: any) => ({
          id: j.id,
          name: `${j.job_type} — ${j.hardware_tier}`,
          status: j.status.charAt(0).toUpperCase() + j.status.slice(1),
          progress: j.progress || 0,
          model: j.model_id?.substring(0, 8) || "—",
        }))
      );
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [selectedProjectId]);

  const sparklineData = useMemo(() => {
    if (!stats) return [];
    return generateSparkline(stats);
  }, [stats]);

  const donutData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Projects", value: Math.max(stats.total_projects, 0) },
      { name: "Models", value: Math.max(stats.models_deployed, 0) },
      { name: "Datasets", value: Math.max(stats.total_datasets, 0) },
      { name: "Jobs", value: Math.max(stats.active_training, 0) },
    ];
  }, [stats]);

  const donutTotal = useMemo(() => donutData.reduce((s, d) => s + d.value, 0), [donutData]);

  if (error && !stats) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={fetchData} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* KPI Cards */}
        {loading ? (
          <KPISkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiConfig.map((kpi, i) => {
              const Icon = kpi.icon;
              const val = stats?.[kpi.key] ?? 0;
              return (
                <motion.div
                  key={kpi.key}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <GlassCard className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-xl"
                          style={{ background: `${kpi.color}15` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: kpi.color }} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{kpi.title}</p>
                          <AnimatedCounter value={val} className="text-2xl font-bold text-foreground" />
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Charts Row */}
        {!loading && stats && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Activity Overview — Area Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
            >
              <GlassCard className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Activity Overview</p>
                  <span className="text-[11px] text-muted-foreground">Last 7 days</span>
                </div>
                <MetricChart data={sparklineData} color="#e5e5e5" height={160} />
              </GlassCard>
            </motion.div>

            {/* Resource Distribution — Donut Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.5 }}
            >
              <GlassCard className="p-5">
                <div className="mb-3">
                  <p className="text-sm font-medium text-foreground">Resource Distribution</p>
                </div>
                <div className="relative" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutTotal > 0 ? donutData : [{ name: "Empty", value: 1 }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={68}
                        paddingAngle={donutTotal > 0 ? 4 : 0}
                        dataKey="value"
                        stroke="none"
                      >
                        {donutTotal > 0 ? (
                          donutData.map((_, idx) => (
                            <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                          ))
                        ) : (
                          <Cell fill="#262626" />
                        )}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-foreground">{donutTotal}</span>
                    <span className="text-[10px] text-muted-foreground">Total</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {donutData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                      <span className="text-[11px] text-muted-foreground">{d.name}</span>
                      <span className="ml-auto text-[11px] font-medium text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>

            {/* Platform Status — Progress Bars */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.5 }}
            >
              <GlassCard className="p-5">
                <div className="mb-4">
                  <p className="text-sm font-medium text-foreground">Platform Status</p>
                </div>
                <div className="space-y-4">
                  {platformMetrics.map((metric, i) => {
                    const Icon = metric.icon;
                    return (
                      <div key={metric.label}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{metric.label}</span>
                          </div>
                          <span className="text-xs font-medium text-foreground">{metric.value}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: metric.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${metric.value}%` }}
                            transition={{ delay: 0.6 + i * 0.1, duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          {[
            { href: "/projects", label: "New Project", icon: Plus, primary: true },
            { href: "/workspaces", label: "Launch Workspace", icon: Terminal },
            { href: "/training", label: "Start Training", icon: Zap },
          ].map((btn) => {
            const Icon = btn.icon;
            return (
              <Link key={btn.href} href={btn.href}>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    className={`gap-2 ${
                      btn.primary
                        ? "bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                        : "border hover:bg-accent"
                    }`}
                    variant={btn.primary ? "default" : "outline"}
                  >
                    <Icon className="h-4 w-4" /> {btn.label}
                  </Button>
                </motion.div>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Activity Feed */}
          <Card className="border-border/50 bg-card/50 lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-foreground">Recent Activity</CardTitle>
              <Link href="/search">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="h-8 w-8 rounded-full bg-accent" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/4 rounded bg-accent" />
                        <div className="h-2 w-1/4 rounded bg-accent" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <EmptyState icon={Activity} title="No recent activity" description="Activity will appear here as your team works on projects." />
              ) : (
                <div className="divide-y divide-border stagger-fade">
                  <AnimatePresence>
                    {activity.map((event, i) => (
                      <TimelineEvent key={i} {...event} index={i} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Jobs with Progress Rings */}
          <Card className="border-border/50 bg-card/50 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">Active Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
              ) : jobs.length === 0 ? (
                <EmptyState icon={Play} title="No active jobs" description="Start a training job to see progress here." actionLabel="Start Training" />
              ) : (
                jobs.map((job, i) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-4 rounded-lg border border-border/50 bg-muted/50 p-3"
                  >
                    <ProgressRing
                      value={job.progress}
                      size={48}
                      strokeWidth={3}
                      color={job.status === "Running" ? "#ffffff" : job.status === "Pending" ? "#a3a3a3" : "#d4d4d4"}
                    >
                      <span className="text-[10px] font-bold text-foreground">{job.progress}%</span>
                    </ProgressRing>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
                        {job.status === "Running" && <PulseIndicator color="green" size="sm" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{job.model}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    </AppShell>
  );
}
