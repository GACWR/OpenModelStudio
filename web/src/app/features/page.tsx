"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Plus, Database, Activity, GitBranch, BarChart3 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { useProjectFilter } from "@/providers/project-filter-provider";

interface FeatureGroup {
  id: string;
  name: string;
  entity: string;
  features: number;
  servingStatus: string;
  lastUpdated: string;
  description: string;
}

interface Feature {
  id: string;
  name: string;
  dtype: string;
  entity: string;
  group: string;
  nullRate: number;
  mean?: number;
  stdDev?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGroup(g: any): FeatureGroup {
  return {
    id: g.id,
    name: g.name,
    entity: g.entity,
    features: g.feature_count ?? g.features?.length ?? 0,
    servingStatus: g.serving_status || "offline",
    lastUpdated: g.updated_at ? new Date(g.updated_at).toLocaleDateString() : "—",
    description: g.description || "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFeature(f: any): Feature {
  return {
    id: f.id,
    name: f.name,
    dtype: f.dtype || f.feature_type || "unknown",
    entity: f.entity || "—",
    group: f.group_id || "—",
    nullRate: f.null_rate != null ? f.null_rate * 100 : 0,
    mean: f.mean,
  };
}


function StatsTab({ features }: { features: Feature[] }) {
  const distData = useMemo(() => {
    const means = features.map((f) => f.mean).filter((v): v is number => v != null);
    if (means.length === 0) return null;
    const min = Math.min(...means);
    const max = Math.max(...means);
    const BIN_COUNT = 15;
    const range = max - min || 1;
    const binWidth = range / BIN_COUNT;
    const bins = Array.from({ length: BIN_COUNT }, (_, i) => ({
      bin: (min + i * binWidth).toFixed(1),
      count: 0,
    }));
    means.forEach((v) => {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
      bins[idx].count++;
    });
    return bins;
  }, [features]);

  if (!distData) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No statistics available"
        description="Feature statistics will appear once features have computed metrics."
      />
    );
  }

  return (
    <Card className="border bg-card/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" /> Feature Value Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distData}>
            <XAxis dataKey="bin" stroke="#475569" fontSize={10} />
            <YAxis stroke="#475569" fontSize={10} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
            <Bar dataKey="count" fill="#d4d4d4" fillOpacity={0.6} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function FeaturesPage() {
  const { selectedProjectId, projects } = useProjectFilter();
  const [groups, setGroups] = useState<FeatureGroup[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupEntity, setNewGroupEntity] = useState("");
  const [newProject, setNewProject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("groups");

  const fetchFeatures = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getFiltered<any[]>("/features/groups", selectedProjectId).then((d) => d.map(mapGroup)),
      api.getFiltered<any[]>("/features", selectedProjectId).then((d) => d.map(mapFeature)),
    ]).then(([g, f]) => {
      setGroups(g);
      setFeatures(f);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load features");
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFeatures();
  }, [selectedProjectId]);

  const handleCreateGroup = async () => {
    if (!newProject) { toast.error("Select a project"); return; }
    if (!newGroupName.trim()) { toast.error("Name is required"); return; }
    setSubmitting(true);
    try {
      await api.post("/features", {
        project_id: newProject,
        name: newGroupName.trim(),
        description: newGroupEntity.trim() || undefined,
        feature_type: "numerical",
      });
      toast.success("Feature created");
      setNewOpen(false); setNewGroupName(""); setNewGroupEntity(""); setNewProject("");
      fetchFeatures();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSubmitting(false); }
  };

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Feature Store</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage, serve, and monitor your ML features</p>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> New Feature Group
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card">
              <DialogHeader><DialogTitle>New Feature Group</DialogTitle><DialogDescription>Create a new feature group for your project.</DialogDescription></DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Project</Label>
                  <Select value={newProject} onValueChange={setNewProject}>
                    <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Feature Name</Label>
                  <Input
                    placeholder="e.g. user_session_count"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="border bg-muted input-glow"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Input
                    placeholder="e.g. Count of user sessions in last 30 days"
                    value={newGroupEntity}
                    onChange={(e) => setNewGroupEntity(e.target.value)}
                    className="border bg-muted input-glow"
                  />
                </div>
                <Button
                  className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                  onClick={handleCreateGroup}
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create Feature Group"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary KPIs */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Feature Groups", value: groups.length, color: "#ffffff", icon: Layers },
            { label: "Total Features", value: features.length, color: "#d4d4d4", icon: Database },
            { label: "Online Serving", value: groups.filter((g) => g.servingStatus === "online").length, color: "#10b981", icon: Activity },
            { label: "Entities", value: new Set(groups.map((g) => g.entity)).size, color: "#f59e0b", icon: GitBranch },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <motion.div key={kpi.label} variants={staggerItem}>
              <GlassCard className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${kpi.color}15` }}>
                    <Icon className="h-4 w-4" style={{ color: kpi.color }} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <AnimatedCounter value={kpi.value} className="text-xl font-bold text-foreground" />
                  </div>
                </div>
              </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card/50 border">
            <TabsTrigger value="groups">Feature Groups</TabsTrigger>
            <TabsTrigger value="features">All Features</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >

          <TabsContent value="groups" forceMount={activeTab === "groups" ? true : undefined} className={activeTab !== "groups" ? "hidden" : ""}>
            {error ? (
              <ErrorState message={error} onRetry={fetchFeatures} />
            ) : loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : groups.length === 0 ? (
              <EmptyState icon={Layers} title="No feature groups" description="Create your first feature group to start organizing features." actionLabel="New Feature Group" onAction={() => setNewOpen(true)} />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {groups.map((g, i) => (
                  <motion.div key={g.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <GlassCard className="p-5 cursor-pointer" hoverScale>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-foreground">{g.name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{g.description}</p>
                        </div>
                        <PulseIndicator
                          color={g.servingStatus === "online" ? "green" : "gray"}
                          pulse={g.servingStatus === "online"}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{g.entity}</Badge>
                        <Badge variant="secondary" className="bg-muted text-[10px]">{g.features} features</Badge>
                        <Badge className={g.servingStatus === "online" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]" : "bg-muted text-[10px]"}>
                          {g.servingStatus}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground/70">{g.lastUpdated}</span>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="features" forceMount={activeTab === "features" ? true : undefined} className={activeTab !== "features" ? "hidden" : ""}>
            <Card className="border bg-card/50">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border">
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Null %</TableHead>
                      <TableHead>Mean</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {features.map((f, i) => (
                      <motion.tr
                        key={f.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b border-border/50"
                      >
                        <TableCell className="font-mono text-sm text-foreground">{f.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] font-mono">{f.dtype}</Badge></TableCell>
                        <TableCell><Badge variant="secondary" className="bg-muted text-[10px]">{f.entity}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-xs">{f.group}</TableCell>
                        <TableCell className={f.nullRate > 2 ? "text-amber-400" : "text-muted-foreground"}>{f.nullRate}%</TableCell>
                        <TableCell className="font-mono text-muted-foreground text-xs">{f.mean != null ? f.mean.toFixed(2) : "\u2014"}</TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" forceMount={activeTab === "stats" ? true : undefined} className={activeTab !== "stats" ? "hidden" : ""}>
            <StatsTab features={features} />
          </TabsContent>
          </motion.div>
          </AnimatePresence>
        </Tabs>
      </AnimatedPage>
    </AppShell>
  );
}
