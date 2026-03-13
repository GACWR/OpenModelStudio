"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion, AnimatePresence } from "framer-motion";
import { Database, FileText, Layers, Eye, GitBranch, HardDrive, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface DatasetData {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  format: string;
  size_bytes: number | null;
  row_count: number | null;
  version: number;
  snapshots: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  schema: SchemaColumn[] | null;
  metadata?: Record<string, unknown>;
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

const formatColors: Record<string, string> = {
  csv: "bg-white/8 text-neutral-400 border-white/15",
  parquet: "bg-red-500/10 text-red-400 border-red-500/20",
  images: "bg-white/10 text-white border-white/20",
  video: "bg-white/8 text-neutral-300 border-white/15",
  jsonl: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  json: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  audio: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export default function DatasetDetailPage() {
  const params = useParams();
  const datasetId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [dataset, setDataset] = useState<DatasetData | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    let cancelled = false;

    async function fetchDataset() {
      try {
        const res = await api.get<DatasetData>(`/datasets/${datasetId}`);
        if (!cancelled) setDataset(res);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load dataset");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDataset();
    return () => { cancelled = true; };
  }, [datasetId]);

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!dataset) {
    return (
      <AppShell>
        <AnimatedPage className="space-y-6">
          <EmptyState
            icon={Database}
            title="Dataset not found"
            description="The dataset you are looking for does not exist or has been deleted."
          />
        </AnimatedPage>
      </AppShell>
    );
  }

  const formatKey = dataset.format.toLowerCase();
  const formatStyle = formatColors[formatKey] ?? "bg-slate-500/10 text-muted-foreground border-slate-500/20";

  // Use real schema from the API (extracted during upload)
  const schemaColumns: SchemaColumn[] = Array.isArray(dataset.schema) ? dataset.schema : [];

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex items-center gap-4">
          <motion.div variants={staggerItem} className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <Database className="h-6 w-6 text-white" />
          </motion.div>
          <div>
            <motion.div variants={staggerItem} className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{dataset.name}</h1>
              <Badge variant="outline" className={formatStyle}>
                {dataset.format}
              </Badge>
              <Badge variant="secondary" className="bg-muted text-xs">v{dataset.version}</Badge>
            </motion.div>
            <motion.p variants={staggerItem} className="mt-1 text-sm text-muted-foreground">
              {dataset.description ?? `${dataset.format} dataset`}
            </motion.p>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card/50 border border-border/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* Overview Tab */}
              <TabsContent value="overview" forceMount={activeTab === "overview" ? true : undefined} className={activeTab !== "overview" ? "hidden" : ""}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <GlassCard className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                        <HardDrive className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Size</p>
                        <p className="text-lg font-semibold text-foreground">{formatBytes(dataset.size_bytes)}</p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                        <BarChart3 className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Rows</p>
                        <p className="text-lg font-semibold text-foreground">
                          {dataset.row_count ? (
                            <AnimatedCounter value={dataset.row_count} />
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/8">
                        <GitBranch className="h-5 w-5 text-neutral-300" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Version</p>
                        <p className="text-lg font-semibold text-foreground">v{dataset.version}</p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                        <Layers className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Snapshots</p>
                        <p className="text-lg font-semibold text-foreground">{dataset.snapshots}</p>
                      </div>
                    </div>
                  </GlassCard>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="text-base">Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Format</span>
                        <span className="text-foreground">{dataset.format}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Created</span>
                        <span className="text-foreground">
                          {new Date(dataset.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Last Updated</span>
                        <span className="text-foreground">
                          {new Date(dataset.updated_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Created By</span>
                        <span className="text-foreground font-mono text-xs">{dataset.created_by.slice(0, 8)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="text-base">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {dataset.description || "No description provided."}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Schema Tab */}
              <TabsContent value="schema" forceMount={activeTab === "schema" ? true : undefined} className={activeTab !== "schema" ? "hidden" : ""}>
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="p-0">
                    {schemaColumns.length === 0 ? (
                      <EmptyState
                        icon={FileText}
                        title="Schema not available"
                        description="Schema could not be inferred for this dataset. Re-upload as CSV to auto-detect columns, or connect a data source to inspect the schema."
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50">
                            <TableHead>Column</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Nullable</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {schemaColumns.map((col, i) => (
                            <motion.tr
                              key={col.name}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="border-b border-border/50"
                            >
                              <TableCell className="font-mono text-white">{col.name}</TableCell>
                              <TableCell className="text-muted-foreground font-mono text-xs">{col.type}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={col.nullable ? "border-amber-500/20 text-amber-400" : "border-emerald-500/20 text-emerald-400"}>
                                  {col.nullable ? "yes" : "no"}
                                </Badge>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Preview Tab */}
              <TabsContent value="preview" forceMount={activeTab === "preview" ? true : undefined} className={activeTab !== "preview" ? "hidden" : ""}>
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="py-12">
                    <EmptyState
                      icon={Eye}
                      title="Connect to view data"
                      description="Data preview requires a live connection to the data source. Configure a data source in project settings to browse rows."
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Versions Tab */}
              <TabsContent value="versions" forceMount={activeTab === "versions" ? true : undefined} className={activeTab !== "versions" ? "hidden" : ""}>
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="p-0">
                    {dataset.version < 1 ? (
                      <EmptyState
                        icon={GitBranch}
                        title="No versions yet"
                        description="Version history will appear here as the dataset is updated."
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50">
                            <TableHead>Version</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Size</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from({ length: dataset.version }, (_, i) => dataset.version - i).map((v, i) => (
                            <motion.tr
                              key={v}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="border-b border-border/50"
                            >
                              <TableCell className="font-mono text-white">v{v}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {new Date(
                                  new Date(dataset.created_at).getTime() + (v - 1) * 7 * 24 * 60 * 60 * 1000
                                ).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{formatBytes(dataset.size_bytes)}</TableCell>
                            </motion.tr>
                          ))}
                        </TableBody>
                      </Table>
                    )}
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
