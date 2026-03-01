"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { StatusBadge } from "@/components/shared/status-badge";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Plug, Plus, Database, ArrowRight, Check, Loader2, RefreshCw } from "lucide-react";

const sourceTypes = [
  { id: "postgresql", name: "PostgreSQL", icon: "🐘", color: "#336791" },
  { id: "s3", name: "Amazon S3", icon: "📦", color: "#FF9900" },
  { id: "huggingface", name: "HuggingFace", icon: "🤗", color: "#FFD21E" },
  { id: "localfs", name: "Local FS", icon: "📁", color: "#64748b" },
  { id: "snowflake", name: "Snowflake", icon: "❄️", color: "#29B5E8" },
  { id: "bigquery", name: "BigQuery", icon: "🔷", color: "#4285F4" },
  { id: "mongodb", name: "MongoDB", icon: "🍃", color: "#47A248" },
  { id: "mysql", name: "MySQL", icon: "🐬", color: "#4479A1" },
  { id: "gcs", name: "GCS", icon: "☁️", color: "#4285F4" },
];

const iconMap: Record<string, string> = {
  postgresql: "🐘",
  s3: "📦",
  huggingface: "🤗",
  localfs: "📁",
  snowflake: "❄️",
  bigquery: "🔷",
  mongodb: "🍃",
  mysql: "🐬",
  gcs: "☁️",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSource(s: any) {
  const config = typeof s.config === "string" ? (() => { try { return JSON.parse(s.config); } catch { return {}; } })() : (s.config || {});
  const sourceType = (s.source_type || "").toLowerCase();
  return {
    id: s.id,
    name: s.name || "",
    type: s.source_type || "Unknown",
    icon: iconMap[sourceType] || "🔌",
    owner: "You",
    status: "healthy",
    lastSync: s.created_at ? new Date(s.created_at).toLocaleDateString() : "—",
    tables: config.tables ?? 0,
    size: config.size || "—",
  };
}

export default function DataSourcesPage() {
  const [sources, setSources] = useState<ReturnType<typeof mapSource>[]>([]);
  const [datasets, setDatasets] = useState<{ id: string; name: string; rows: string; size: string; format: string; updated: string }[]>([]);
  const [features, setFeatures] = useState<{ id: string; name: string; entity: string; dtype: string; shared: boolean; updated: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("sources");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [dsProject, setDsProject] = useState("");
  const [dsName, setDsName] = useState("");

  const fetchSources = () => {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>("/data-sources")
      .then((data) => setSources(data.map(mapSource)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data sources"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSources();
    api.get<{ id: string; name: string }[]>("/projects").then(setProjects).catch(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>("/datasets").then((data) => setDatasets(data.map((d: any) => ({
      id: d.id,
      name: d.name || "",
      rows: d.row_count ? d.row_count.toLocaleString() : "—",
      size: d.size_bytes ? `${(d.size_bytes / 1024 / 1024).toFixed(1)} MB` : "—",
      format: d.format || "—",
      updated: d.updated_at ? new Date(d.updated_at).toLocaleDateString() : "—",
    })))).catch((err) => setError(err instanceof Error ? err.message : "Failed to load datasets"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>("/features").then((data) => setFeatures(data.map((f: any) => ({
      id: f.id,
      name: f.name || "",
      entity: f.entity || "—",
      dtype: f.dtype || f.feature_type || "unknown",
      shared: !!f.shared,
      updated: f.updated_at ? new Date(f.updated_at).toLocaleDateString() : "—",
    })))).catch((err) => setError(err instanceof Error ? err.message : "Failed to load features"));
  }, []);

  const handleTestConnection = async () => {
    if (!dsProject) { toast.error("Select a project first"); return; }
    if (!dsName.trim()) { toast.error("Source name is required"); return; }
    setTesting(true);
    try {
      await api.post("/data-sources", { project_id: dsProject, name: dsName.trim(), source_type: selectedType });
      setTesting(false);
      setTestSuccess(true);
      toast.success("Connection successful");
      setWizardStep(2);
    } catch (err) {
      setTesting(false);
      setTestSuccess(false);
      toast.error(err instanceof Error ? err.message : "Connection failed");
    }
  };

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plug className="h-6 w-6 text-white" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Data Sources</h1>
              <p className="text-sm text-muted-foreground">
                <AnimatedCounter value={sources.length} className="text-white font-semibold" /> connected sources
              </p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setWizardStep(0); setSelectedType(null); setTestSuccess(false); setDsProject(""); setDsName(""); } }}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> Add Data Source
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="max-w-lg border bg-card">
              <DialogHeader><DialogTitle>Add Data Source</DialogTitle><DialogDescription>Connect an external data source to your project.</DialogDescription></DialogHeader>
              <AnimatePresence mode="wait">
                {wizardStep === 0 && (
                  <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Project</Label>
                      <Select value={dsProject} onValueChange={setDsProject}>
                        <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select project" /></SelectTrigger>
                        <SelectContent>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Source Name</Label>
                      <Input placeholder="e.g. Production DB" value={dsName} onChange={(e) => setDsName(e.target.value)} className="border bg-muted input-glow" />
                    </div>
                    <p className="text-sm text-muted-foreground">Select provider</p>
                    <div className="grid grid-cols-3 gap-3">
                      {sourceTypes.map((t) => (
                        <motion.button
                          key={t.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { setSelectedType(t.id); setWizardStep(1); }}
                          className={`flex flex-col items-center gap-2 rounded-xl border border p-4 transition-all hover:border-white/30 hover:bg-white/5 ${selectedType === t.id ? "border-white bg-white/10" : ""}`}
                        >
                          <span className="text-2xl">{t.icon}</span>
                          <span className="text-xs text-muted-foreground">{t.name}</span>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
                {wizardStep === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pt-4">
                    <p className="text-sm text-muted-foreground">Connection details</p>
                    <div className="space-y-3">
                      <div className="space-y-2"><Label>Host</Label><Input placeholder="db.example.com" className="border bg-muted input-glow" /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2"><Label>Port</Label><Input placeholder="5432" className="border bg-muted input-glow" /></div>
                        <div className="space-y-2"><Label>Database</Label><Input placeholder="mydb" className="border bg-muted input-glow" /></div>
                      </div>
                      <div className="space-y-2"><Label>Username</Label><Input placeholder="admin" className="border bg-muted input-glow" /></div>
                      <div className="space-y-2"><Label>Password</Label><Input type="password" placeholder="••••••••" className="border bg-muted input-glow" /></div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="border" onClick={() => setWizardStep(0)}>Back</Button>
                      <Button
                        className="flex-1 gap-2 bg-white text-black hover:bg-white/90"
                        onClick={handleTestConnection}
                        disabled={testing}
                      >
                        {testing ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</>
                        ) : testSuccess ? (
                          <><Check className="h-4 w-4 text-emerald-400" /> Connected!</>
                        ) : (
                          <>Test & Save <ArrowRight className="h-4 w-4" /></>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
                {wizardStep === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4 pt-4 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                      className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
                    >
                      <Check className="h-8 w-8 text-emerald-400" />
                    </motion.div>
                    <p className="text-lg font-semibold text-foreground">Connection Successful!</p>
                    <p className="text-sm text-muted-foreground">Data source has been added to your workspace.</p>
                    <Button className="w-full bg-white text-black hover:bg-white/90" onClick={() => { setDialogOpen(false); fetchSources(); }}>Done</Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card/50 border">
            <TabsTrigger value="sources">Data Sources</TabsTrigger>
            <TabsTrigger value="datasets">Datasets</TabsTrigger>
            <TabsTrigger value="features">Feature Store</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >

          <TabsContent value="sources" forceMount={activeTab === "sources" ? true : undefined} className={activeTab !== "sources" ? "hidden" : "space-y-4"}>
            {error ? (
              <ErrorState message={error} onRetry={fetchSources} />
            ) : sources.length === 0 && !loading ? (
              <EmptyState icon={Database} title="No data sources yet" description="Connect your first data source to get started." actionLabel="Add Source" onAction={() => setDialogOpen(true)} />
            ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sources.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -4 }}
                >
                  <GlassCard className="p-5" hoverScale>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{s.icon}</span>
                        <div>
                          <h3 className="font-semibold text-foreground">{s.name}</h3>
                          <p className="text-xs text-muted-foreground/70">{s.type} · {s.owner}</p>
                        </div>
                      </div>
                      <PulseIndicator
                        color={s.status === "healthy" ? "green" : "yellow"}
                        pulse={s.status !== "healthy"}
                        size="md"
                      />
                    </div>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {s.tables > 0 && <div className="flex justify-between"><span>Tables</span><span className="text-foreground">{s.tables}</span></div>}
                      <div className="flex justify-between"><span>Size</span><span className="text-foreground">{s.size}</span></div>
                      <div className="flex justify-between"><span>Last Sync</span><span className="text-foreground">{s.lastSync}</span></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <StatusBadge status={s.status} />
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={async () => {
                        try {
                          await api.post(`/data-sources/${s.id}/test`, {});
                          toast.success(`Sync OK — ${s.name}`);
                        } catch { toast.error(`Sync failed — ${s.name}`); }
                      }}>
                        <RefreshCw className="h-3 w-3" /> Sync
                      </Button>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
            )}
          </TabsContent>

          <TabsContent value="datasets" forceMount={activeTab === "datasets" ? true : undefined} className={activeTab !== "datasets" ? "hidden" : "space-y-4"}>
            <GlassCard className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border">
                    <TableHead>Name</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets.map((d, i) => (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border hover:bg-accent/30 transition-colors"
                    >
                      <TableCell className="font-medium text-foreground">{d.name}</TableCell>
                      <TableCell className="text-muted-foreground">{d.rows}</TableCell>
                      <TableCell className="text-muted-foreground">{d.size}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{d.format}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{d.updated}</TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </GlassCard>
          </TabsContent>

          <TabsContent value="features" forceMount={activeTab === "features" ? true : undefined} className={activeTab !== "features" ? "hidden" : "space-y-4"}>
            <GlassCard className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border">
                    <TableHead>Feature Name</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Data Type</TableHead>
                    <TableHead>Shared</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {features.map((f, i) => (
                    <motion.tr
                      key={f.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border hover:bg-accent/30 transition-colors"
                    >
                      <TableCell className="font-mono text-sm font-medium text-foreground">{f.name}</TableCell>
                      <TableCell><Badge variant="outline">{f.entity}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{f.dtype}</TableCell>
                      <TableCell>
                        {f.shared ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Shared</Badge>
                        ) : (
                          <Badge variant="outline">Private</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.updated}</TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </GlassCard>
          </TabsContent>
          </motion.div>
          </AnimatePresence>
        </Tabs>
      </AnimatedPage>
    </AppShell>
  );
}
