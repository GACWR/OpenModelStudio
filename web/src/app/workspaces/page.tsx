"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useProjectFilter } from "@/providers/project-filter-provider";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { AnimatedCounter } from "@/components/shared/animated-counter";

import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { motion } from "framer-motion";
import { Terminal, Code, BarChart3, Box, Plus, Clock, Cpu, ExternalLink, RefreshCw, Square, Loader2 } from "lucide-react";

const ideOptions = [
  { name: "JupyterLab", icon: Terminal, description: "Interactive notebooks & terminal", color: "#f59e0b" },
  { name: "VS Code", icon: Code, description: "Full IDE with extensions", color: "#ffffff" },
  { name: "RStudio", icon: BarChart3, description: "R development environment", color: "#d4d4d4" },
  { name: "Custom", icon: Box, description: "Bring your own environment", color: "#a3a3a3" },
];

interface WorkspaceItem {
  id: string;
  name: string;
  project_id: string;
  status: string;
  access_url?: string;
  hardware_tier: string;
  created_at: string;
  ide: string;
  project: string;
  duration: string;
  cpu: number;
  ram: number;
  gpu: number;
  cpuLabel: string;
  ramLabel: string;
  gpuLabel: string;
  env: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWorkspace(w: any): WorkspaceItem {
  return {
    id: w.id,
    name: w.name || "",
    project_id: w.project_id || "",
    status: w.status ? w.status.charAt(0).toUpperCase() + w.status.slice(1) : "Stopped",
    access_url: w.access_url || undefined,
    hardware_tier: w.hardware_tier || "cpu-small",
    created_at: w.created_at || "",
    ide: w.ide || "JupyterLab",
    project: w.project_name || w.project_id || "",
    duration: w.duration || "—",
    cpu: w.cpu_usage ?? 0,
    ram: w.ram_usage ?? 0,
    gpu: w.gpu_usage ?? 0,
    cpuLabel: w.hardware_tier?.includes("large") ? "16 cores" : w.hardware_tier?.includes("medium") ? "8 cores" : "4 cores",
    ramLabel: w.hardware_tier?.includes("large") ? "64 GB" : w.hardware_tier?.includes("medium") ? "32 GB" : "16 GB",
    gpuLabel: w.hardware_tier?.includes("gpu") ? "GPU" : "None",
    env: w.environment || "Custom",
  };
}

function ResourceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground/70">{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-accent">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function WorkspacesPage() {
  const { selectedProjectId, projects } = useProjectFilter();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIDE, setSelectedIDE] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceItem | null>(null);
  const [launching, setLaunching] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [wsReady, setWsReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchWorkspaces = () => {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.getFiltered<any[]>("/workspaces", selectedProjectId)
      .then((data) => setWorkspaces(data.map(mapWorkspace)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspaces"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorkspaces();
  }, [selectedProjectId]);

  const getWorkspaceUrl = (ws: { access_url?: string }) => ws.access_url || "";

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    try {
      if (!selectedProject) {
        toast.error("Please select a project first");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await api.post<any>("/workspaces/launch", {
        project_id: selectedProject,
        name: selectedIDE || "jupyterlab",
      });
      const ws = mapWorkspace(data.workspace || data);
      setActiveWorkspace(ws);
      toast.success("Workspace launched — waiting for pod to start...");
      fetchWorkspaces();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }, [selectedIDE, selectedProject]);

  const handleStop = useCallback(async (id: string) => {
    try {
      await api.delete(`/workspaces/${id}`);
      setActiveWorkspace(null);
      toast.success("Workspace stopped");
      fetchWorkspaces();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stop failed");
    }
  }, []);

  // Poll for workspace readiness when activeWorkspace is set but not yet running/has no URL
  useEffect(() => {
    if (!activeWorkspace) return;
    const wsUrl = getWorkspaceUrl(activeWorkspace);
    if (activeWorkspace.status === "Running" && wsUrl) return; // already ready
    const interval = setInterval(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await api.get<any[]>("/workspaces");
        const found = data.find((w: any) => w.id === activeWorkspace.id);
        if (found) {
          const mapped = mapWorkspace(found);
          setActiveWorkspace(mapped);
          if (mapped.status === "Running" && mapped.access_url) {
            clearInterval(interval);
          }
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeWorkspace?.id, activeWorkspace?.status]);

  // Reset readiness when switching workspaces
  useEffect(() => {
    setWsReady(false);
  }, [activeWorkspace?.id]);

  // Probe workspace URL until JupyterLab is actually responding
  useEffect(() => {
    if (!activeWorkspace) return;
    const wsUrl = getWorkspaceUrl(activeWorkspace);
    if (activeWorkspace.status !== "Running" || !wsUrl) return;
    if (wsReady) return;

    let cancelled = false;
    const probe = async () => {
      try {
        await fetch(wsUrl, { mode: "no-cors" });
        if (!cancelled) setWsReady(true);
      } catch {
        // Network error — JupyterLab not serving yet
      }
    };

    probe(); // Try immediately
    const interval = setInterval(probe, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeWorkspace?.id, activeWorkspace?.status, activeWorkspace?.access_url, wsReady]);

  // Iframe mode — workspace active with a URL
  if (activeWorkspace) {
    const wsUrl = getWorkspaceUrl(activeWorkspace);
    const isReady = activeWorkspace.status === "Running" && !!wsUrl && wsReady;
    return (
      <AppShell>
        <div className="flex h-[calc(100vh-4rem)] flex-col">
          <div className="flex items-center justify-between border-b border bg-card/80 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-3">
              <Terminal className="h-4 w-4 text-white" />
              <span className="text-sm font-medium text-foreground">{activeWorkspace.name}</span>
              <StatusBadge status={activeWorkspace.status} />
              {isReady && <PulseIndicator color="green" pulse size="sm" />}
            </div>
            <div className="flex items-center gap-2">
              {isReady && (
                <>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => { if (iframeRef.current) { const src = iframeRef.current.src; iframeRef.current.src = ''; setTimeout(() => { if (iframeRef.current) iframeRef.current.src = src; }, 50); } }}>
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => window.open(wsUrl, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" /> Pop Out
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-red-400 hover:text-red-300" onClick={() => handleStop(activeWorkspace.id)}>
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => setActiveWorkspace(null)}>
                ✕
              </Button>
            </div>
          </div>
          {isReady ? (
            <iframe
              ref={iframeRef}
              src={wsUrl}
              className="flex-1 w-full border-0"
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-white mx-auto" />
                <div>
                  {activeWorkspace.status === "Running" && !!wsUrl ? (
                    <>
                      <p className="text-foreground font-medium">Connecting to workspace...</p>
                      <p className="text-sm text-muted-foreground mt-1">JupyterLab is starting up. Waiting for it to be ready.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-foreground font-medium">Starting workspace...</p>
                      <p className="text-sm text-muted-foreground mt-1">Pod is being provisioned. This may take a moment.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  const running = workspaces.filter((w) => w.status === "Running").length;

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workspaces</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <AnimatedCounter value={running} className="text-emerald-400 font-semibold" /> running · <AnimatedCounter value={workspaces.length} className="text-muted-foreground font-semibold" /> total
            </p>
          </div>
          <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> Launch Workspace
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="max-w-2xl border bg-card">
              <DialogHeader>
                <DialogTitle>Launch New Workspace</DialogTitle>
                <DialogDescription>Configure and launch a new JupyterLab workspace in your project.</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                <div>
                  <Label className="mb-3 block">Choose IDE</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {ideOptions.map((ide) => {
                      const Icon = ide.icon;
                      return (
                        <motion.div key={ide.name} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <GlassCard
                            className={`cursor-pointer p-4 ${selectedIDE === ide.name ? "!border-white ring-1 ring-white/30" : ""}`}
                            onClick={() => setSelectedIDE(ide.name)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${ide.color}15` }}>
                                <Icon className="h-5 w-5" style={{ color: ide.color }} />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{ide.name}</p>
                                <p className="text-xs text-muted-foreground">{ide.description}</p>
                              </div>
                            </div>
                          </GlassCard>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Environment</Label>
                    <Select>
                      <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="python">Python</SelectItem>
                        <SelectItem value="rust">Rust</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Hardware</Label>
                    <Select>
                      <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">4 CPU, 16GB</SelectItem>
                        <SelectItem value="medium">8 CPU, 32GB, V100</SelectItem>
                        <SelectItem value="large">16 CPU, 64GB, A100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10" onClick={handleLaunch} disabled={launching}>
                  {launching ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating pod...</>
                  ) : (
                    "Launch Workspace"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Workspace Cards */}
        {error ? (
          <ErrorState message={error} onRetry={fetchWorkspaces} />
        ) : workspaces.length === 0 && !loading ? (
          <EmptyState icon={Terminal} title="No workspaces yet" description="Launch your first workspace to get started." actionLabel="Launch Workspace" onAction={() => setLaunchOpen(true)} />
        ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((ws, i) => (
            <motion.div
              key={ws.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <GlassCard className="overflow-hidden" hoverScale>
                {/* Status Header */}
                <div className={`h-1 ${
                  ws.status === "Running" ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                  ws.status === "Stopped" ? "bg-gradient-to-r from-slate-500 to-slate-400" :
                  "bg-gradient-to-r from-amber-500 to-amber-400"
                }`} />
                <div className="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                          <Terminal className="h-5 w-5 text-white" />
                        </div>
                        <PulseIndicator
                          color={ws.status === "Running" ? "green" : "gray"}
                          pulse={ws.status === "Running"}
                          size="sm"
                          className="absolute -bottom-0.5 -right-0.5"
                        />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{ws.name}</h3>
                        <p className="text-xs text-muted-foreground">{ws.project}</p>
                      </div>
                    </div>
                    <StatusBadge status={ws.status} />
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="bg-muted/80 text-[10px]">{ws.ide}</Badge>
                    <Badge variant="secondary" className="bg-muted/80 text-[10px]">{ws.env}</Badge>
                    {ws.status === "Running" && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {ws.duration}
                      </span>
                    )}
                  </div>

                  {/* Resource Usage */}
                  {ws.status === "Running" ? (
                    <div className="space-y-2">
                      <ResourceBar label={`CPU (${ws.cpuLabel})`} value={ws.cpu} color="#a3a3a3" />
                      <ResourceBar label={`RAM (${ws.ramLabel})`} value={ws.ram} color="#f59e0b" />
                      {ws.gpuLabel !== "None" && (
                        <ResourceBar label={`GPU (${ws.gpuLabel})`} value={ws.gpu} color="#d4d4d4" />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-accent/30 px-3 py-2 text-xs text-muted-foreground/70">
                      <Cpu className="h-3.5 w-3.5" /> {ws.cpuLabel} · {ws.ramLabel} · {ws.gpuLabel}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {ws.status === "Running" ? (
                      <>
                        <Button size="sm" className="flex-1 bg-white text-black hover:bg-white/90 gap-1" onClick={() => setActiveWorkspace(ws)}>
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </Button>
                        <Button size="sm" variant="outline" className="border gap-1 text-red-400 hover:text-red-300" onClick={() => handleStop(ws.id)}>
                          <Square className="h-3.5 w-3.5" /> Stop
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1 border gap-1" onClick={async () => {
                        try {
                          await api.delete(`/workspaces/${ws.id}`);
                          await api.post("/workspaces/launch", { name: ws.name, project_id: ws.project_id });
                          toast.success("Restarting...");
                          fetchWorkspaces();
                        } catch { toast.error("Restart failed"); }
                      }}>
                        <Terminal className="h-3.5 w-3.5" /> Restart
                      </Button>
                    )}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
