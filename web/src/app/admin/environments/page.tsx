"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ProgressRing } from "@/components/shared/progress-ring";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { Box, Plus, Pencil, Trash2, Cpu, HardDrive, Star } from "lucide-react";

interface EnvItem {
  id: string;
  name: string;
  image: string;
  revisions: number;
  isDefault: boolean;
  clusters: string[];
  cpu: string;
  cpuPct: number;
  ram: string;
  ramPct: number;
  gpu: string;
  gpuPct: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEnv(e: any): EnvItem {
  const clusters = Array.isArray(e.clusters)
    ? e.clusters
    : typeof e.clusters === "string"
      ? (() => { try { return JSON.parse(e.clusters); } catch { return []; } })()
      : [];
  const cpuLimit = e.cpu_limit || 0;
  const ramLimit = e.ram_limit || 0;
  const gpuLimit = e.gpu_limit || 0;
  return {
    id: e.id,
    name: e.name || "",
    image: e.docker_image || "",
    revisions: 1,
    isDefault: false,
    clusters,
    cpu: `${cpuLimit} cores`,
    cpuPct: Math.min(cpuLimit * 12.5, 100),
    ram: `${ramLimit} GB`,
    ramPct: Math.min(ramLimit * 3, 100),
    gpu: gpuLimit > 0 ? `${gpuLimit}x GPU` : "None",
    gpuPct: gpuLimit > 0 ? Math.min(gpuLimit * 50, 100) : 0,
  };
}

export default function AdminEnvironmentsPage() {
  const [envs, setEnvs] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createName, setCreateName] = useState("");
  const [createImage, setCreateImage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");

  const [error, setError] = useState<string | null>(null);

  const fetchEnvs = () => {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>("/environments")
      .then((data) => setEnvs(data.map(mapEnv)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load environments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEnvs(); }, []);

  const handleCreateEnv = async () => {
    if (!createName.trim()) { toast.error("Name is required"); return; }
    setSubmitting(true);
    try {
      await api.post("/environments", { name: createName.trim(), docker_image: createImage.trim() });
      toast.success("Environment created");
      setCreateOpen(false); setCreateName(""); setCreateImage("");
      fetchEnvs();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSubmitting(false); }
  };

  const handleDeleteEnv = async (id: string) => {
    try {
      await api.delete(`/environments/${id}`);
      toast.success("Environment deleted");
      fetchEnvs();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to delete"); }
  };

  const handleEditEnv = async () => {
    if (!editName.trim()) { toast.error("Name is required"); return; }
    setSubmitting(true);
    try {
      await api.put(`/environments/${editId}`, { name: editName.trim(), docker_image: editImage.trim() });
      toast.success("Environment updated");
      setEditOpen(false);
      fetchEnvs();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to update"); }
    finally { setSubmitting(false); }
  };

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Box className="h-6 w-6 text-white" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Environments</h1>
              <p className="text-sm text-muted-foreground">
                <AnimatedCounter value={envs.length} className="text-white font-semibold" /> configured environments
              </p>
            </div>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> Create Environment
                </Button>
              </motion.div>
            </DialogTrigger>
            <AnimatePresence>
              {createOpen && (
                <DialogContent className="max-w-lg border bg-card" forceMount>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <DialogHeader><DialogTitle>Create Environment</DialogTitle><DialogDescription>Define a new compute environment for workspaces.</DialogDescription></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input placeholder="My Custom Environment" value={createName} onChange={(e) => setCreateName(e.target.value)} className="border bg-muted input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Base Docker Image</Label>
                        <Input placeholder="nvidia/cuda:12.1-base" value={createImage} onChange={(e) => setCreateImage(e.target.value)} className="border bg-muted input-glow font-mono text-sm" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Dockerfile Instructions</Label>
                        <Textarea placeholder="RUN pip install torch transformers..." rows={5} className="border bg-muted font-mono text-sm" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">CPU Limit</Label>
                          <Input placeholder="8 cores" className="border bg-muted input-glow" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">RAM Limit</Label>
                          <Input placeholder="32 GB" className="border bg-muted input-glow" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">GPU</Label>
                          <Input placeholder="1x A100" className="border bg-muted input-glow" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Cluster Compatibility</Label>
                        <div className="flex flex-wrap gap-2">
                          {["CPU", "GPU A100", "GPU V100", "GPU H100", "TPU v4"].map((c) => (
                            <motion.div key={c} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                              <Badge variant="outline" className="cursor-pointer hover:bg-accent transition-colors">{c}</Badge>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                      <Button className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10" onClick={handleCreateEnv} disabled={submitting}>{submitting ? "Creating..." : "Create"}</Button>
                    </div>
                  </motion.div>
                </DialogContent>
              )}
            </AnimatePresence>
          </Dialog>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={fetchEnvs} />
        ) : envs.length === 0 && !loading ? (
          <EmptyState icon={Box} title="No environments yet" description="Create your first environment to get started." actionLabel="New Environment" onAction={() => setCreateOpen(true)} />
        ) : (
        <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={staggerContainer} initial="hidden" animate="show">
          {envs.map((env) => (
            <motion.div
              key={env.id}
              variants={staggerItem}
            >
              <GlassCard className="p-5 space-y-4" hoverScale>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{env.name}</h3>
                      {env.isDefault && (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] gap-1">
                          <Star className="h-2.5 w-2.5" /> Default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground truncate max-w-[220px]">{env.image}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent" onClick={() => { setEditId(env.id); setEditName(env.name); setEditImage(env.image); setEditOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-500/10" onClick={() => handleDeleteEnv(env.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>

                {/* Resource Rings */}
                <div className="flex items-center justify-around">
                  <div className="flex flex-col items-center gap-1">
                    <ProgressRing value={env.cpuPct} size={48} strokeWidth={3} color="#a3a3a3">
                      <Cpu className="h-3.5 w-3.5 text-neutral-400" />
                    </ProgressRing>
                    <span className="text-[10px] text-muted-foreground">{env.cpu}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <ProgressRing value={env.ramPct} size={48} strokeWidth={3} color="#f59e0b">
                      <HardDrive className="h-3.5 w-3.5 text-amber-400" />
                    </ProgressRing>
                    <span className="text-[10px] text-muted-foreground">{env.ram}</span>
                  </div>
                  {env.gpuPct > 0 && (
                    <div className="flex flex-col items-center gap-1">
                      <ProgressRing value={env.gpuPct} size={48} strokeWidth={3} color="#d4d4d4">
                        <span className="text-[8px] font-bold text-neutral-300">GPU</span>
                      </ProgressRing>
                      <span className="text-[10px] text-muted-foreground">{env.gpu}</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{env.revisions} revisions</span>
                  <div className="flex flex-wrap gap-1">
                    {env.clusters.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] h-5">{c}</Badge>
                    ))}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
        )}
        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <AnimatePresence>
            {editOpen && (
              <DialogContent className="max-w-lg border bg-card" forceMount>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                >
                  <DialogHeader><DialogTitle>Edit Environment</DialogTitle><DialogDescription>Update this environment&apos;s configuration.</DialogDescription></DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="border bg-muted input-glow" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Base Docker Image</Label>
                      <Input value={editImage} onChange={(e) => setEditImage(e.target.value)} className="border bg-muted input-glow font-mono text-sm" />
                    </div>
                    <Button className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10" onClick={handleEditEnv} disabled={submitting}>{submitting ? "Saving..." : "Save Changes"}</Button>
                  </div>
                </motion.div>
              </DialogContent>
            )}
          </AnimatePresence>
        </Dialog>
      </AnimatedPage>
    </AppShell>
  );
}
