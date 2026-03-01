"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { Settings, Server, Database, HardDrive, AlertCircle, RefreshCw, Terminal, Users, FolderKanban, Cpu } from "lucide-react";
import { api } from "@/lib/api";

interface ServiceEntry {
  name: string;
  status: "healthy" | "degraded" | "unknown" | "checking";
  port: number;
}

const SERVICE_CONFIG: ServiceEntry[] = [
  { name: "API Server", status: "checking", port: 8080 },
  { name: "PostgreSQL", status: "unknown", port: 5432 },
  { name: "PostGraphile", status: "unknown", port: 5000 },
  { name: "JupyterHub", status: "unknown", port: 8000 },
  { name: "Redis", status: "unknown", port: 6379 },
  { name: "MinIO", status: "unknown", port: 9000 },
];

interface AdminStats {
  users: number;
  projects: number;
  jobs: number;
}

export default function AdminSystemPage() {
  const [services, setServices] = useState<ServiceEntry[]>(SERVICE_CONFIG);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Reset API Server to checking state
    setServices((prev) =>
      prev.map((s) => (s.name === "API Server" ? { ...s, status: "checking" } : s))
    );

    // Fetch admin stats
    try {
      const data = await api.get<AdminStats>("/admin/stats");
      setStats(data);
    } catch {
      setStats(null);
    }

    // Fetch healthz to verify API server
    try {
      await api.get("/healthz");
      setServices((prev) =>
        prev.map((s) => (s.name === "API Server" ? { ...s, status: "healthy" } : s))
      );
    } catch {
      setServices((prev) =>
        prev.map((s) => (s.name === "API Server" ? { ...s, status: "degraded" } : s))
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData().then(() => toast.success("Refreshed"));
  }, [fetchData]);

  const statusColor = (status: string) => {
    if (status === "healthy") return "green" as const;
    if (status === "degraded") return "yellow" as const;
    if (status === "checking") return "blue" as const;
    return "gray" as const;
  };

  const statusBadgeClass = (status: string) => {
    if (status === "healthy") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "degraded") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    if (status === "checking") return "bg-white/10 text-white border-white/20";
    return "bg-muted/50 text-muted-foreground border-border";
  };

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-white" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">System Health</h1>
              <p className="text-sm text-muted-foreground">Infrastructure overview and monitoring</p>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
            <Button variant="outline" className="gap-2 border" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </motion.div>
        </div>

        {/* Service Status Grid */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Services</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((svc, i) => (
              <motion.div
                key={svc.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard className="p-4" hoverScale>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <PulseIndicator
                        color={statusColor(svc.status)}
                        pulse={svc.status === "checking" || svc.status === "degraded"}
                        size="md"
                      />
                      <div>
                        <p className="font-medium text-foreground">{svc.name}</p>
                        <p className="text-xs text-muted-foreground/70">:{svc.port}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass(svc.status)}
                    >
                      {svc.status}
                    </Badge>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Resource Cards */}
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Users */}
          <motion.div variants={staggerItem} whileHover={{ scale: 1.03 }}>
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-white" />
                <h3 className="font-semibold text-foreground">Users</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Users</span>
                  <span className="text-foreground">
                    {stats ? <AnimatedCounter value={stats.users} /> : loading ? "..." : "N/A"}
                  </span>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Projects */}
          <motion.div variants={staggerItem} whileHover={{ scale: 1.03 }}>
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-emerald-400" />
                <h3 className="font-semibold text-foreground">Projects</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Projects</span>
                  <span className="text-foreground">
                    {stats ? <AnimatedCounter value={stats.projects} /> : loading ? "..." : "N/A"}
                  </span>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Jobs */}
          <motion.div variants={staggerItem} whileHover={{ scale: 1.03 }}>
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-foreground">Jobs</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Jobs</span>
                  <span className="text-foreground">
                    {stats ? <AnimatedCounter value={stats.jobs} /> : loading ? "..." : "N/A"}
                  </span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>

        {/* Infrastructure Resource Cards */}
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Kubernetes */}
          <motion.div variants={staggerItem} whileHover={{ scale: 1.03 }}>
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-white" />
                <h3 className="font-semibold text-foreground">Kubernetes</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nodes</span>
                  <span className="text-foreground">N/A</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pods</span>
                  <span className="text-foreground">N/A</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Database */}
          <motion.div variants={staggerItem} whileHover={{ scale: 1.03 }}>
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-400" />
                <h3 className="font-semibold text-foreground">Database</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connections</span>
                  <span className="text-foreground">N/A</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Replication</span>
                  <span className="text-foreground">N/A</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Storage */}
          <motion.div variants={staggerItem} whileHover={{ scale: 1.03 }}>
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-foreground">Storage</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">S3 Buckets</span>
                  <span className="text-foreground">N/A</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PVC</span>
                  <span className="text-foreground">N/A</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>

        {/* Events — replaced with EmptyState */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          <GlassCard className="overflow-hidden">
            <div className="border-b border px-5 py-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-foreground">Recent Events</span>
            </div>
            <div className="p-4">
              <EmptyState
                icon={AlertCircle}
                title="System Events"
                description="Connect a log aggregator to view real-time system events."
              />
            </div>
          </GlassCard>
        </motion.div>

        {/* System Logs — replaced with EmptyState */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
          <GlassCard className="overflow-hidden">
            <div className="border-b border px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-foreground">System Logs</span>
              </div>
            </div>
            <div className="p-4">
              <EmptyState
                icon={Terminal}
                title="No system logs"
                description="Connect a log aggregator to view real-time system logs."
              />
            </div>
          </GlassCard>
        </motion.div>
      </AnimatedPage>
    </AppShell>
  );
}
