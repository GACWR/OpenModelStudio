"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { CodeEditor } from "@/components/shared/code-editor";
import { MetricChart } from "@/components/shared/metric-chart";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Play, Brain, GitBranch, BarChart3, Info, Terminal, ExternalLink, Download, FileBox } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ModelData {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  framework: string;
  source_code: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: string;
  language: string;
  origin_workspace_id: string | null;
}

interface CodeResponse {
  model_id: string;
  version: number;
  source_code: string | null;
}

interface ModelVersion {
  id: string;
  model_id: string;
  version: number;
  source_code: string | null;
  created_by: string;
  created_at: string;
}

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

interface MetricRecord {
  id: string;
  job_id: string;
  metric_name: string;
  value: number;
  step: number | null;
  epoch: number | null;
  metadata: Record<string, unknown> | null;
  recorded_at: string;
}

interface ArtifactItem {
  id: string;
  name: string;
  artifact_type: string;
  size_bytes: number | null;
  created_at: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

const frameworkColors: Record<string, string> = {
  pytorch: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  tensorflow: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  jax: "bg-white/10 text-white border-white/20",
  rust: "bg-red-500/10 text-red-400 border-red-500/20",
};

function computeDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "--";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function ModelDetailPage() {
  const params = useParams();
  const modelId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<ModelData | null>(null);
  const [code, setCode] = useState("");
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [metricsData, setMetricsData] = useState<Record<string, { name: string; value: number }[]>>({});
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [modelRes, codeRes, versionsRes, allJobsRes, artifactsRes] = await Promise.all([
          api.get<ModelData>(`/models/${modelId}`),
          api.get<CodeResponse>(`/models/${modelId}/code`).catch(() => null),
          api.get<ModelVersion[]>(`/models/${modelId}/versions`).catch(() => [] as ModelVersion[]),
          api.get<Job[]>("/training/jobs").catch(() => [] as Job[]),
          api.get<ArtifactItem[]>(`/models/${modelId}/artifacts`).catch(() => [] as ArtifactItem[]),
        ]);

        if (cancelled) return;

        setModel(modelRes);
        setCode(codeRes?.source_code ?? "");
        setVersions(versionsRes ?? []);
        setArtifacts(artifactsRes ?? []);

        const modelJobs = (allJobsRes ?? []).filter((j) => j.model_id === modelId);
        setJobs(modelJobs);

        // Fetch metrics from the latest completed or running job
        if (modelJobs.length > 0) {
          const latestJob = modelJobs[0]; // already sorted by created_at DESC from API
          try {
            const metricsRes = await api.get<MetricRecord[]>(`/training/${latestJob.id}/metrics`);
            if (!cancelled && metricsRes && metricsRes.length > 0) {
              const grouped: Record<string, { name: string; value: number }[]> = {};
              for (const record of metricsRes) {
                const key = record.metric_name;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push({
                  name: (record.step ?? record.epoch ?? grouped[key].length + 1).toString(),
                  value: record.value,
                });
              }
              setMetricsData(grouped);
            }
          } catch {
            // metrics may not exist yet
          }
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load model");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [modelId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/models/${modelId}/code`, { source_code: code });
      toast.success("Code saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    try {
      await api.post(`/models/${modelId}/run`, { job_type: "training" });
      toast.success("Model run started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start run");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!model) {
    return (
      <AppShell>
        <AnimatedPage className="space-y-6">
          <EmptyState
            icon={Brain}
            title="Model not found"
            description="The model you are looking for does not exist or has been deleted."
          />
        </AnimatedPage>
      </AppShell>
    );
  }

  const frameworkKey = model.framework.toLowerCase();
  const frameworkStyle = frameworkColors[frameworkKey] ?? "bg-slate-500/10 text-muted-foreground border-slate-500/20";
  const metricNames = Object.keys(metricsData);

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex items-center gap-4">
          <motion.div variants={staggerItem} className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/8">
            <Brain className="h-6 w-6 text-neutral-300" />
          </motion.div>
          <div>
            <motion.div variants={staggerItem} className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{model.name}</h1>
              <Badge variant="outline" className={frameworkStyle}>
                {model.framework}
              </Badge>
              <StatusBadge status={model.status} />
            </motion.div>
            <motion.p variants={staggerItem} className="mt-1 text-sm text-muted-foreground">
              {model.description ?? `${model.framework} model`} &middot; v{model.version}.0
            </motion.p>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card/50 border border-border/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
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
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Model Info Card */}
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" /> Model Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Framework</p>
                      <Badge variant="outline" className={frameworkStyle}>{model.framework}</Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Version</p>
                      <p className="text-foreground font-mono">v{model.version}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <StatusBadge status={model.status} />
                    </div>
                    <div>
                      <p className="text-muted-foreground">Language</p>
                      <p className="text-foreground">{model.language}</p>
                    </div>
                  </div>
                  {model.description && (
                    <div>
                      <p className="text-muted-foreground text-sm">Description</p>
                      <p className="text-foreground text-sm mt-1">{model.description}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-sm">Origin</p>
                    <p className="text-foreground text-sm mt-1">
                      {model.origin_workspace_id ? (
                        <a href={`/workspaces`} className="text-emerald-400 hover:underline flex items-center gap-1">
                          <Terminal className="h-3.5 w-3.5" /> Created from workspace
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        "Created via code editor"
                      )}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {new Date(model.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    &nbsp;&middot;&nbsp;
                    Updated {new Date(model.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions Card */}
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Play className="h-4 w-4" /> Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      className="w-full gap-2 bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                      onClick={handleRun}
                    >
                      <Play className="h-4 w-4" /> Run Training
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border"
                      onClick={() => setActiveTab("code")}
                    >
                      <Save className="h-4 w-4" /> Edit Code
                    </Button>
                  </motion.div>

                  {/* Recent Jobs Summary */}
                  {jobs.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <p className="text-sm text-muted-foreground mb-2">Recent Jobs</p>
                      <div className="space-y-2">
                        {jobs.slice(0, 3).map((j) => (
                          <div key={j.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground capitalize">{j.job_type}</span>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={j.status} />
                              <span className="text-xs text-muted-foreground">{computeDuration(j.started_at, j.completed_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="code" forceMount={activeTab === "code" ? true : undefined} className={activeTab !== "code" ? "hidden" : ""}>
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">model.py</CardTitle>
                <div className="flex gap-2">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button variant="outline" size="sm" className="gap-2 border" onClick={handleSave} disabled={saving}>
                      <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button size="sm" className="gap-2 bg-emerald-500 hover:bg-emerald-600 pulse-glow-emerald shadow-lg shadow-emerald-500/20" onClick={handleRun}>
                      <Play className="h-3.5 w-3.5" /> Run
                    </Button>
                  </motion.div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-sm text-blue-300">
                  <Terminal className="h-4 w-4 shrink-0" />
                  <span>For full development, use a <a href="/workspaces" className="underline hover:text-blue-200">JupyterLab workspace</a> with the OpenModelStudio SDK. Use this editor for quick edits.</span>
                </div>
                <CodeEditor value={code} onChange={setCode} language={model.language || "python"} height="500px" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="versions" forceMount={activeTab === "versions" ? true : undefined} className={activeTab !== "versions" ? "hidden" : ""}>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-0">
                {versions.length === 0 ? (
                  <EmptyState
                    icon={GitBranch}
                    title="No versions yet"
                    description="Version history will appear here after you save changes to the model code."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead>Version</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Author</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((v, i) => (
                        <motion.tr
                          key={v.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="border-b border-border/50"
                        >
                          <TableCell className="font-mono text-white">v{v.version}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(v.created_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {v.created_by.slice(0, 8)}
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" forceMount={activeTab === "jobs" ? true : undefined} className={activeTab !== "jobs" ? "hidden" : ""}>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-0">
                {jobs.length === 0 ? (
                  <EmptyState
                    icon={Play}
                    title="No training jobs"
                    description="Start a training run from the Code tab to see jobs here."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead>Job</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Hardware</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j, i) => (
                        <motion.tr
                          key={j.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="border-b border-border/50"
                        >
                          <TableCell className="font-medium">{j.job_type}</TableCell>
                          <TableCell><StatusBadge status={j.status} /></TableCell>
                          <TableCell className="text-muted-foreground">
                            {computeDuration(j.started_at, j.completed_at)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{j.hardware_tier}</TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="artifacts" forceMount={activeTab === "artifacts" ? true : undefined} className={activeTab !== "artifacts" ? "hidden" : ""}>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-0">
                {artifacts.length === 0 ? (
                  <EmptyState
                    icon={FileBox}
                    title="No artifacts yet"
                    description="Train the model to generate downloadable artifacts (.pt, .pkl, .onnx)."
                  />
                ) : (
                  <div className="divide-y divide-border/50">
                    {artifacts.map((a, i) => (
                      <motion.div
                        key={a.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center justify-between p-4"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.artifact_type} &middot; {formatBytes(a.size_bytes)} &middot;{" "}
                            {new Date(a.created_at).toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </p>
                        </div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 border"
                            onClick={async () => {
                              try {
                                const res = await api.get<{ download_url: string }>(`/artifacts/${a.id}/download`);
                                window.open(res.download_url, "_blank");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Download failed");
                              }
                            }}
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                        </motion.div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics" forceMount={activeTab === "metrics" ? true : undefined} className={activeTab !== "metrics" ? "hidden" : ""}>
            {metricNames.length === 0 ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-border/50 bg-card/50">
                  <CardHeader>
                    <CardTitle className="text-base">Training Loss</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EmptyState
                      icon={BarChart3}
                      title="No loss data"
                      description="Loss metrics will appear here once a job starts reporting data."
                    />
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/50">
                  <CardHeader>
                    <CardTitle className="text-base">Accuracy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EmptyState
                      icon={BarChart3}
                      title="No accuracy data"
                      description="Accuracy metrics will appear here once a job starts reporting data."
                    />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {metricNames.map((name) => {
                  const color = name.toLowerCase().includes("loss")
                    ? "#ef4444"
                    : name.toLowerCase().includes("acc")
                      ? "#10b981"
                      : "#d4d4d4";
                  return (
                    <Card key={name} className="border-border/50 bg-card/50">
                      <CardHeader>
                        <CardTitle className="text-base capitalize">{name.replace(/_/g, " ")}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <MetricChart data={metricsData[name]} color={color} height={300} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
          </motion.div>
          </AnimatePresence>
        </Tabs>
      </AnimatedPage>
    </AppShell>
  );
}
