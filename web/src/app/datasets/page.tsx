"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { FileUpload } from "@/components/shared/file-upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Database, Upload, HardDrive, FileText, Image, Video, BarChart3 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useProjectFilter } from "@/providers/project-filter-provider";

interface Dataset {
  id: string;
  name: string;
  format: string;
  size: string;
  versions: number;
  snapshots: number;
  rows?: number;
  icon: string;
  color: string;
}

const iconMap: Record<string, React.ElementType> = {
  images: Image,
  video: Video,
  CSV: FileText,
  audio: HardDrive,
  Parquet: Database,
  JSON: FileText,
};

const formatMeta: Record<string, { icon: string; color: string }> = {
  images: { icon: "images", color: "#ffffff" },
  video: { icon: "video", color: "#d4d4d4" },
  CSV: { icon: "CSV", color: "#a3a3a3" },
  audio: { icon: "audio", color: "#f59e0b" },
  Parquet: { icon: "Parquet", color: "#ef4444" },
  JSON: { icon: "JSON", color: "#10b981" },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDataset(d: any): Dataset {
  const meta = formatMeta[d.format] || { icon: "CSV", color: "#94a3b8" };
  return {
    id: d.id,
    name: d.name,
    format: d.format,
    size: formatBytes(d.size_bytes),
    versions: d.version || 1,
    snapshots: d.snapshots || 0,
    rows: d.row_count,
    icon: meta.icon,
    color: meta.color,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:text/csv;base64,")
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DatasetsPage() {
  const { selectedProjectId, projects } = useProjectFilter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProject, setUploadProject] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFormat, setUploadFormat] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchDatasets = () => {
    setLoading(true);
    setError(null);
    api.getFiltered<any[]>("/datasets", selectedProjectId)
      .then((data) => setDatasets(data.map(mapDataset)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load datasets"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDatasets();
  }, [selectedProjectId]);

  const handleFileSelected = useCallback((file: File) => {
    setUploadFile(file);
    // Auto-detect format from file extension if not set
    if (!uploadFormat) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "csv") setUploadFormat("CSV");
      else if (ext === "parquet") setUploadFormat("Parquet");
      else if (ext === "json" || ext === "jsonl") setUploadFormat("JSON");
    }
    // Auto-fill name from filename if empty
    if (!uploadName) {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      setUploadName(nameWithoutExt);
    }
  }, [uploadFormat, uploadName]);

  const handleUploadSubmit = async () => {
    if (!uploadProject) { toast.error("Select a project"); return; }
    if (!uploadName.trim()) { toast.error("Dataset name is required"); return; }
    setUploading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        project_id: uploadProject,
        name: uploadName.trim(),
        format: uploadFormat || "CSV",
      };

      // If a file was uploaded, include it as base64
      if (uploadFile) {
        body.data = await fileToBase64(uploadFile);
      }

      await api.post("/datasets", body);
      toast.success("Dataset created");
      setUploadOpen(false);
      setUploadProject(""); setUploadName(""); setUploadFormat(""); setUploadFile(null);
      fetchDatasets();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Datasets</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage and version your training data</p>
          </div>
          <Dialog open={uploadOpen} onOpenChange={(open) => {
            setUploadOpen(open);
            if (!open) { setUploadProject(""); setUploadName(""); setUploadFormat(""); setUploadFile(null); }
          }}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Upload className="h-4 w-4" /> Upload Dataset
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card">
              <DialogHeader><DialogTitle>Upload Dataset</DialogTitle><DialogDescription>Upload a new dataset to your project.</DialogDescription></DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Project</Label>
                  <Select value={uploadProject} onValueChange={setUploadProject}>
                    <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Dataset Name</Label>
                  <Input placeholder="e.g. training-images-v1" value={uploadName} onChange={(e) => setUploadName(e.target.value)} className="border bg-muted input-glow" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Format</Label>
                  <Select value={uploadFormat} onValueChange={setUploadFormat}>
                    <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select format" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CSV">CSV</SelectItem>
                      <SelectItem value="Parquet">Parquet</SelectItem>
                      <SelectItem value="JSON">JSON</SelectItem>
                      <SelectItem value="images">Images</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio">Audio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FileUpload onUpload={handleFileSelected} />
                <Button
                  className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                  onClick={handleUploadSubmit}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Create Dataset"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={fetchDatasets} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : datasets.length === 0 ? (
          <EmptyState icon={Database} title="No datasets yet" description="Upload your first dataset to get started." actionLabel="Upload Dataset" onAction={() => setUploadOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {datasets.map((ds, i) => {
              const Icon = iconMap[ds.icon] || Database;
              return (
                <motion.div
                  key={ds.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                >
                <Link href={`/datasets/${ds.id}`}>
                  <GlassCard className="cursor-pointer p-5 h-full">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${ds.color}15` }}>
                        <Icon className="h-5 w-5" style={{ color: ds.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{ds.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{ds.format} · {ds.size}</p>
                      </div>
                    </div>
                    {ds.rows && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <BarChart3 className="h-3 w-3" />
                        <AnimatedCounter value={ds.rows} className="font-mono text-muted-foreground" /> rows
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="secondary" className="bg-muted text-[10px]">v{ds.versions}</Badge>
                      <Badge variant="secondary" className="bg-muted text-[10px]">{ds.snapshots} snapshots</Badge>
                    </div>
                  </GlassCard>
                </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
