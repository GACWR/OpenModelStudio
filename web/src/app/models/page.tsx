"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Brain, Search, Plus, Terminal, Code2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Model {
  id: string;
  name: string;
  framework: string;
  language: string;
  status: string;
  version: string;
  description: string;
}

const frameworkColors: Record<string, string> = {
  PyTorch: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Rust: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  TensorFlow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  JAX: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function ModelsPage() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [regMode, setRegMode] = useState<"choose" | "editor">("choose");
  const [regName, setRegName] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [regFramework, setRegFramework] = useState("");
  const [regProject, setRegProject] = useState("");
  const [registering, setRegistering] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const fetchModels = () => {
    setLoading(true);
    api.get<Model[]>("/models")
      .then(setModels)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleRegister = async () => {
    if (!regProject) { toast.error("Select a project"); return; }
    if (!regName.trim()) { toast.error("Model name is required"); return; }
    setRegistering(true);
    try {
      await api.post("/models", { project_id: regProject, name: regName.trim(), description: regDesc.trim(), framework: regFramework || "PyTorch" });
      toast.success("Model registered");
      setRegOpen(false);
      setRegName(""); setRegDesc(""); setRegFramework(""); setRegProject("");
      fetchModels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register model");
    } finally {
      setRegistering(false);
    }
  };

  useEffect(() => {
    fetchModels();
    api.get<{ id: string; name: string }[]>("/projects").then(setProjects).catch(() => {});
  }, []);

  const filtered = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Models</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your model library — train, version, deploy</p>
          </div>
          <Dialog open={regOpen} onOpenChange={(open) => { setRegOpen(open); if (open) setRegMode("choose"); }}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> Register Model
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card sm:max-w-lg">
              <DialogHeader><DialogTitle>Register Model</DialogTitle><DialogDescription>Register a new model in your project.</DialogDescription></DialogHeader>

              {regMode === "choose" ? (
                <div className="space-y-4 pt-2">
                  {/* Option A: Create in Workspace (primary) */}
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <button
                      onClick={() => { setRegOpen(false); router.push("/workspaces"); }}
                      className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-left hover:bg-emerald-500/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                          <Terminal className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Create in Workspace</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Recommended — develop in JupyterLab and register with the SDK</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded bg-black/30 px-3 py-2 font-mono text-xs text-emerald-300">
                        import openmodelstudio<br />
                        model = openmodelstudio.register_model(&quot;my-model&quot;)
                      </div>
                    </button>
                  </motion.div>

                  {/* Option B: Quick Editor (secondary) */}
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <button
                      onClick={() => setRegMode("editor")}
                      className="w-full rounded-lg border border-border/50 bg-card/50 p-4 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                          <Code2 className="h-5 w-5 text-neutral-300" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Quick Editor</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Create an empty model and write code in the browser</p>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <button onClick={() => setRegMode("choose")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">&larr; Back to options</button>
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select value={regProject} onValueChange={setRegProject}>
                      <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Model Name</Label>
                    <Input placeholder="my-model" value={regName} onChange={(e) => setRegName(e.target.value)} className="border bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input placeholder="What does this model do?" value={regDesc} onChange={(e) => setRegDesc(e.target.value)} className="border bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Framework</Label>
                    <Select value={regFramework} onValueChange={setRegFramework}>
                      <SelectTrigger className="border bg-muted"><SelectValue placeholder="Select framework" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PyTorch">PyTorch</SelectItem>
                        <SelectItem value="TensorFlow">TensorFlow</SelectItem>
                        <SelectItem value="JAX">JAX</SelectItem>
                        <SelectItem value="Rust">Rust</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full bg-white text-black hover:bg-white/90" disabled={registering} onClick={handleRegister}>
                    {registering ? "Registering..." : "Register Model"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Animated search bar */}
        <motion.div
          animate={{ width: searchFocused ? "100%" : "320px" }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="border bg-card/50 pl-10 input-glow transition-all"
          />
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchModels} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Brain} title="No models found" description="Register your first model to get started." actionLabel="Register Model" onAction={() => setRegOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((model, i) => (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{
                  scale: 1.02,
                  rotateX: 2,
                  rotateY: -2,
                }}
                style={{ perspective: 1000 }}
              >
                <Link href={`/models/${model.id}`}>
                  <GlassCard className="cursor-pointer p-5 h-full">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                          <Brain className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{model.name}</h3>
                          <p className="text-xs text-muted-foreground">{model.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={frameworkColors[model.framework] || ""}>{model.framework}</Badge>
                        <Badge variant="secondary" className="bg-muted text-[10px]">v{model.version}</Badge>
                        <StatusBadge status={model.status} />
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
