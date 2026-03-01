"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { ProgressRing } from "@/components/shared/progress-ring";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { StatusBadge } from "@/components/shared/status-badge";
import { StageBadge } from "@/components/shared/stage-badge";
import { TimelineEvent } from "@/components/shared/timeline-event";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, Users, FileText, Settings, Play, FlaskConical, Box,
  ChevronRight, Zap, Database, ArrowLeft, AlertTriangle, Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ProjectData {
  id: string;
  name: string;
  description: string;
  stage: string;
  readme: string;
  collaborators: { name: string; role: string; active: boolean }[];
  stats: { commits: number; branches: number; datasets: number; models: number; jobs: number };
}

interface ActivityItem {
  user: string;
  action: string;
  target: string;
  timestamp: string;
}

const defaultProject: ProjectData = {
  id: "",
  name: "Loading...",
  description: "",
  stage: "Ideation",
  readme: "",
  collaborators: [],
  stats: { commits: 0, branches: 0, datasets: 0, models: 0, jobs: 0 },
};

const quickActions = [
  { label: "Start Training", icon: Zap, color: "bg-white text-black hover:bg-white/90", href: "/training" },
  { label: "Launch Workspace", icon: Play, color: "bg-neutral-200 text-black hover:bg-neutral-300", href: "/workspaces" },
  { label: "View Experiments", icon: FlaskConical, color: "bg-emerald-500 hover:bg-emerald-600", href: "/experiments" },
];

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [project, setProject] = useState<ProjectData>(defaultProject);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [models, setModels] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [datasets, setDatasets] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [experiments, setExperiments] = useState<any[]>([]);

  // Settings form state
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsStage, setSettingsStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any>(`/projects/${projectId}`)
      .then((data) => {
        const p: ProjectData = {
          id: data.id,
          name: data.name || "",
          description: data.description || "",
          stage: data.stage || "Ideation",
          readme: data.readme || `# ${data.name || "Project"}\n\nNo README yet.`,
          collaborators: data.collaborators || [],
          stats: data.stats || { commits: 0, branches: 0, datasets: 0, models: 0, jobs: 0 },
        };
        setProject(p);
        setSettingsName(p.name);
        setSettingsDescription(p.description);
        setSettingsStage(p.stage);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load project"))
      .finally(() => setLoading(false));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(`/projects/${projectId}/activity`)
      .then((data) => {
        setActivity(
          data.map((a) => ({
            user: a.user || a.user_name || "Unknown",
            action: a.action || "",
            target: a.target || "",
            timestamp: a.timestamp || a.created_at || new Date().toISOString(),
          }))
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load activity"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(`/projects/${projectId}/models`)
      .then((data) => setModels(data || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load models"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(`/projects/${projectId}/datasets`)
      .then((data) => setDatasets(data || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load datasets"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(`/projects/${projectId}/experiments`)
      .then((data) => setExperiments(data || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load experiments"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(`/projects/${projectId}/collaborators`)
      .then((data) => {
        if (data && data.length > 0) {
          setProject((prev) => ({ ...prev, collaborators: data.map((c) => ({ name: c.name || c.username || "Unknown", role: c.role || "member", active: c.active ?? false })) }));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load collaborators"));
  }, [projectId]);

  function formatBytes(bytes: number | null): string {
    if (!bytes) return "\u2014";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  async function handleSaveSettings() {
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}`, { name: settingsName, description: settingsDescription, stage: settingsStage });
      setProject((prev) => ({ ...prev, name: settingsName, description: settingsDescription, stage: settingsStage }));
      toast.success("Project settings saved.");
    } catch {
      toast.error("Failed to save project settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProject() {
    setDeleting(true);
    try {
      await api.delete(`/projects/${projectId}`);
      toast.success("Project deleted.");
      router.push("/projects");
    } catch {
      toast.error("Failed to delete project.");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  const kpis = [
    { label: "Models", value: models.length, icon: Box, color: "#ffffff" },
    { label: "Datasets", value: datasets.length, icon: Database, color: "#d4d4d4" },
    { label: "Experiments", value: experiments.length, icon: FlaskConical, color: "#a3a3a3" },
    { label: "Training Jobs", value: project.stats.jobs, icon: Play, color: "#737373" },
  ];

  if (error) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link href="/projects" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Projects
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{project.name}</span>
        </motion.div>

        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl border bg-gradient-to-r from-white/5 via-white/3 to-white/5 p-8 dot-grid"
        >
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-foreground">{project.name}</h1>
                <StageBadge stage={project.stage} />
                <PulseIndicator color="green" size="md" />
              </div>
              <p className="max-w-2xl text-muted-foreground">{project.description}</p>
              <div className="mt-4 flex gap-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <motion.div key={action.label} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button size="sm" className={`gap-2 ${action.color} shadow-lg`} onClick={() => router.push(action.href)}>
                        <Icon className="h-3.5 w-3.5" /> {action.label}
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
            <Button variant="outline" className="gap-2 border shrink-0" onClick={() => setActiveTab("settings")}>
              <Settings className="h-4 w-4" /> Settings
            </Button>
          </div>
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-10 right-20 h-32 w-32 rounded-full bg-white/8 blur-3xl" />
        </motion.div>

        {/* KPI Cards */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <motion.div
                key={kpi.label}
                variants={staggerItem}
              >
                <GlassCard className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${kpi.color}15` }}>
                      <Icon className="h-5 w-5" style={{ color: kpi.color }} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <AnimatedCounter
                        value={kpi.value}
                        className="text-xl font-bold text-foreground"
                      />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card/50 border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="experiments">Experiments</TabsTrigger>
            <TabsTrigger value="datasets">Datasets</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <TabsContent value="overview" forceMount={activeTab === "overview" ? true : undefined} className={activeTab !== "overview" ? "hidden" : ""}>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {/* Main content */}
                  <div className="space-y-6 lg:col-span-2">
                    {/* README */}
                    <GlassCard className="overflow-hidden">
                      <div className="border-b border px-5 py-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">README.md</span>
                      </div>
                      <div className="p-5">
                        <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono leading-relaxed">
                          {project.readme}
                        </pre>
                      </div>
                    </GlassCard>

                    {/* Activity */}
                    <GlassCard className="overflow-hidden">
                      <div className="border-b border px-5 py-3">
                        <span className="text-sm font-medium text-foreground">Recent Activity</span>
                      </div>
                      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="divide-y divide-border px-5">
                        {activity.map((event, i) => (
                          <motion.div key={i} variants={staggerItem}>
                            <TimelineEvent {...event} index={i} />
                          </motion.div>
                        ))}
                      </motion.div>
                    </GlassCard>
                  </div>

                  {/* Sidebar */}
                  <div className="space-y-4">
                    {/* Stats */}
                    <GlassCard className="p-4 space-y-3">
                      {Object.entries({
                        Commits: { icon: GitBranch, value: project.stats.commits },
                        Branches: { icon: GitBranch, value: project.stats.branches },
                        Models: { icon: Box, value: project.stats.models },
                        "Jobs Run": { icon: Play, value: project.stats.jobs },
                      }).map(([label, { icon: Icon, value }]) => (
                        <div key={label}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Icon className="h-4 w-4" /> {label}
                            </span>
                            <AnimatedCounter value={value} className="font-medium text-foreground" />
                          </div>
                          <Separator className="bg-border mt-3 last:hidden" />
                        </div>
                      ))}
                    </GlassCard>

                    {/* Collaborators */}
                    <GlassCard className="overflow-hidden">
                      <div className="border-b border px-4 py-3 flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">Team</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {project.collaborators.map((c) => (
                          <div key={c.name} className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-muted text-xs">{c.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <PulseIndicator
                                color={c.active ? "green" : "gray"}
                                pulse={c.active}
                                size="sm"
                                className="absolute -bottom-0.5 -right-0.5"
                              />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.role}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlassCard>

                    {/* Health */}
                    <GlassCard className="p-4 flex items-center gap-4">
                      <ProgressRing value={Math.min(100, (models.length + datasets.length + experiments.length) * 10)} size={56} strokeWidth={4} color="#10b981">
                        <span className="text-xs font-bold text-foreground">{Math.min(100, (models.length + datasets.length + experiments.length) * 10)}%</span>
                      </ProgressRing>
                      <div>
                        <p className="text-sm font-medium text-foreground">Project Health</p>
                        <p className="text-xs text-muted-foreground">
                          {models.length} models, {datasets.length} datasets, {experiments.length} experiments
                        </p>
                      </div>
                    </GlassCard>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="models" forceMount={activeTab === "models" ? true : undefined} className={activeTab !== "models" ? "hidden" : ""}>
                {models.length === 0 ? (
                  <EmptyState icon={Box} title="No models yet" description="Register or train a model to see it here." actionLabel="Go to Models" onAction={() => router.push("/models")} />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {models.map((model, i) => (
                      <motion.div key={model.id || model.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ scale: 1.02, y: -2 }}>
                        <GlassCard className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-semibold text-foreground">{model.name}</p>
                              <p className="text-xs text-muted-foreground/70">{model.version ? `v${model.version}` : model.framework || ""}</p>
                            </div>
                            <StatusBadge status={model.status === "deployed" ? "Deployed" : model.status === "running" ? "Running" : model.status === "ready" ? "Ready" : "Stopped"} />
                          </div>
                          {model.framework && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">{model.framework}</Badge>
                            </div>
                          )}
                          {model.status === "running" && (
                            <div className="flex items-center gap-2 mt-2">
                              <PulseIndicator color="blue" pulse size="sm" />
                              <span className="text-xs text-white">Training in progress...</span>
                            </div>
                          )}
                        </GlassCard>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="experiments" forceMount={activeTab === "experiments" ? true : undefined} className={activeTab !== "experiments" ? "hidden" : ""}>
                {experiments.length === 0 ? (
                  <EmptyState icon={FlaskConical} title="No experiments yet" description="Start an experiment to track hyperparameters and compare results." actionLabel="New Experiment" />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {experiments.map((exp, i) => (
                      <motion.div key={exp.id || exp.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ scale: 1.02, y: -2 }}>
                        <GlassCard className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-semibold text-foreground">{exp.name}</p>
                              <p className="text-xs text-muted-foreground/70">{exp.description || ""}</p>
                            </div>
                            <StatusBadge status={exp.status === "completed" ? "Completed" : exp.status === "running" ? "Running" : exp.status === "failed" ? "Failed" : "Pending"} />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">{exp.run_count ?? 0} runs</Badge>
                          </div>
                          {exp.status === "running" && (
                            <div className="flex items-center gap-2 mt-2">
                              <PulseIndicator color="blue" pulse size="sm" />
                              <span className="text-xs text-white">Experiment in progress...</span>
                            </div>
                          )}
                        </GlassCard>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="datasets" forceMount={activeTab === "datasets" ? true : undefined} className={activeTab !== "datasets" ? "hidden" : ""}>
                {datasets.length === 0 ? (
                  <EmptyState icon={Database} title="No datasets yet" description="Upload or link a dataset to get started." actionLabel="Go to Datasets" onAction={() => router.push("/datasets")} />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {datasets.map((ds, i) => (
                      <motion.div key={ds.id || ds.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ scale: 1.02, y: -2 }}>
                        <GlassCard className="p-5">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                              <Database className="h-5 w-5 text-amber-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{ds.name}</p>
                              <p className="text-xs text-muted-foreground/70">{ds.format || "Unknown"}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{ds.row_count ? `${ds.row_count.toLocaleString()} rows` : "\u2014"}</span>
                            <span>{formatBytes(ds.size_bytes)}</span>
                          </div>
                        </GlassCard>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="team" forceMount={activeTab === "team" ? true : undefined} className={activeTab !== "team" ? "hidden" : ""}>
                <GlassCard className="p-6">
                  <div className="space-y-4">
                    {project.collaborators.map((c, i) => (
                      <motion.div
                        key={c.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex items-center justify-between rounded-lg border bg-accent/30 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-white/15 text-primary-foreground">{c.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <PulseIndicator color={c.active ? "green" : "gray"} pulse={c.active} />
                          <span className="text-xs text-muted-foreground">{c.active ? "Online" : "Offline"}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </GlassCard>
              </TabsContent>

              <TabsContent value="settings" forceMount={activeTab === "settings" ? true : undefined} className={activeTab !== "settings" ? "hidden" : ""}>
                <div className="space-y-6">
                  <GlassCard className="p-6 space-y-5">
                    <h3 className="text-lg font-semibold text-foreground">General</h3>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Project Name</label>
                      <Input
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        className="border bg-card/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Description</label>
                      <Textarea
                        value={settingsDescription}
                        onChange={(e) => setSettingsDescription(e.target.value)}
                        rows={4}
                        className="border bg-card/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Stage</label>
                      <Select value={settingsStage} onValueChange={setSettingsStage}>
                        <SelectTrigger className="border bg-card/50">
                          <SelectValue placeholder="Select a stage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ideation">Ideation</SelectItem>
                          <SelectItem value="data_acquisition">Data Acquisition</SelectItem>
                          <SelectItem value="development">Development</SelectItem>
                          <SelectItem value="validation">Validation</SelectItem>
                          <SelectItem value="production">Production</SelectItem>
                          <SelectItem value="monitoring">Monitoring</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleSaveSettings} disabled={saving} className="gap-2 bg-white text-black hover:bg-white/90">
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </GlassCard>

                  <GlassCard className="p-6 border-red-500/30">
                    <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-5 w-5" /> Danger Zone
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Deleting this project is permanent and cannot be undone. All models, datasets, and experiments associated with this project will also be removed.
                    </p>
                    <Button variant="destructive" className="gap-2" onClick={() => setDeleteDialogOpen(true)}>
                      <Trash2 className="h-4 w-4" /> Delete Project
                    </Button>
                  </GlassCard>
                </div>

                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Project</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={handleDeleteProject} disabled={deleting}>
                        {deleting ? "Deleting..." : "Delete Project"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </AnimatedPage>
    </AppShell>
  );
}
