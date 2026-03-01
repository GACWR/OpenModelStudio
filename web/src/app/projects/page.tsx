"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { StageBadge } from "@/components/shared/stage-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, LayoutGrid, List, FolderKanban, ArrowRight, Activity } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const stages = ["All", "Ideation", "Data Acquisition", "R&D", "Validation", "Production", "Monitoring"];

const gradientHeaders = [
  "from-white/20 to-white/5",
  "from-white/15 to-white/8",
  "from-white/10 to-white/3",
  "from-white/18 to-white/6",
  "from-white/12 to-white/4",
  "from-white/16 to-white/7",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProject(p: any) {
  let tags: string[] = [];
  try {
    tags = typeof p.tags === "string" ? JSON.parse(p.tags) : Array.isArray(p.tags) ? p.tags : [];
  } catch { tags = []; }
  return {
    id: p.id,
    name: p.name,
    description: p.description || "",
    stage: p.stage || "Ideation",
    health: p.health || "healthy",
    owner: p.owner_name || p.created_by || "You",
    members: (p.collaborators || []) as string[],
    tags,
    updated: p.updated_at || p.created_at || new Date().toISOString(),
    progress: p.progress ?? 0,
    recentActivity: "",
  };
}

const wizardSteps = ["Details", "Environment", "Team"];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ReturnType<typeof mapProject>[]>([]);
  const [_loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState("All");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStage, setNewStage] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fetchProjects = () => {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>("/projects")
      .then((data) => setProjects(data.map(mapProject)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load projects"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleCreateProject = async () => {
    if (!newName.trim()) { toast.error("Project name is required"); return; }
    setCreating(true);
    try {
      await api.post("/projects", {
        name: newName.trim(),
        description: newDesc.trim(),
        stage: newStage || "Ideation",
      });
      toast.success("Project created");
      setWizardOpen(false);
      setWizardStep(0);
      setNewName("");
      setNewDesc("");
      setNewStage("");
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const filtered = projects.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStage = activeStage === "All" || p.stage === activeStage;
    return matchSearch && matchStage;
  });

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <AnimatedCounter value={projects.length} className="text-white font-semibold" /> projects across the full ML lifecycle
            </p>
          </div>
          <Dialog open={wizardOpen} onOpenChange={(open) => { setWizardOpen(open); if (!open) setWizardStep(0); }}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <Plus className="h-4 w-4" /> New Project
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="border bg-card max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Set up a new project to organize your models, data, and experiments.</DialogDescription>
              </DialogHeader>
              {/* Step indicator */}
              <div className="flex items-center gap-2 pt-2">
                {wizardSteps.map((step, i) => (
                  <div key={step} className="flex items-center gap-2 flex-1">
                    <motion.div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${
                        i <= wizardStep ? "bg-white text-black" : "bg-accent text-muted-foreground"
                      }`}
                      animate={{ scale: i === wizardStep ? 1.1 : 1 }}
                    >
                      {i + 1}
                    </motion.div>
                    <span className={`text-xs ${i === wizardStep ? "text-foreground" : "text-muted-foreground"}`}>{step}</span>
                    {i < wizardSteps.length - 1 && <div className={`flex-1 h-px ${i < wizardStep ? "bg-white" : "bg-accent"}`} />}
                  </div>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={wizardStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 pt-4"
                >
                  {wizardStep === 0 && (
                    <>
                      <div className="space-y-2">
                        <Label>Project Name</Label>
                        <Input placeholder="My AI Project" value={newName} onChange={(e) => setNewName(e.target.value)} className="border bg-muted input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea placeholder="What is this project about?" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="border bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <Label>Stage</Label>
                        <Select value={newStage} onValueChange={setNewStage}>
                          <SelectTrigger className="border bg-muted">
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.slice(1).map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {wizardStep === 1 && (
                    <>
                      <div className="space-y-2">
                        <Label>Runtime Environment</Label>
                        <Select>
                          <SelectTrigger className="border bg-muted">
                            <SelectValue placeholder="Select environment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pytorch">PyTorch 2.1 + CUDA 12</SelectItem>
                            <SelectItem value="tf">TensorFlow 2.15</SelectItem>
                            <SelectItem value="rust">Rust ML Stack</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Hardware Tier</Label>
                        <Select>
                          <SelectTrigger className="border bg-muted">
                            <SelectValue placeholder="Select hardware" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">Small (4 CPU, 16GB)</SelectItem>
                            <SelectItem value="large">Large (16 CPU, 64GB, A100)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {wizardStep === 2 && (
                    <>
                      <div className="space-y-2">
                        <Label>Invite Team Members</Label>
                        <Input placeholder="email@example.com" className="border bg-muted input-glow" />
                      </div>
                      <p className="text-xs text-muted-foreground">You can always add members later from project settings.</p>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
              <div className="flex gap-2 pt-2">
                {wizardStep > 0 && (
                  <Button variant="outline" className="border" onClick={() => setWizardStep(wizardStep - 1)}>Back</Button>
                )}
                <Button
                  className="flex-1 bg-white text-black hover:bg-white/90 gap-2"
                  disabled={creating}
                  onClick={() => {
                    if (wizardStep < wizardSteps.length - 1) setWizardStep(wizardStep + 1);
                    else handleCreateProject();
                  }}
                >
                  {wizardStep < wizardSteps.length - 1 ? <>Next <ArrowRight className="h-4 w-4" /></> : creating ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stage Pipeline Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {stages.map((stage) => (
            <motion.div key={stage} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant={activeStage === stage ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveStage(stage)}
                className={`pill-transition ${
                  activeStage === stage
                    ? "bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                    : "border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {stage}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Search + View Toggle */}
        <div className="flex items-center gap-3">
          <motion.div
            className="relative flex-1"
            animate={{ boxShadow: searchFocused ? "0 0 20px rgba(255,255,255,0.06)" : "none" }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="border bg-card/50 pl-10 input-glow transition-all duration-300"
            />
          </motion.div>
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              className={`rounded-none ${view === "grid" ? "bg-accent" : ""}`}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`rounded-none ${view === "list" ? "bg-accent" : ""}`}
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Project Grid */}
        {error ? (
          <ErrorState message={error} onRetry={fetchProjects} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No projects found" description={projects.length === 0 ? "Create your first project to get started." : "Try adjusting your search or filter criteria"} actionLabel={projects.length === 0 ? "New Project" : undefined} onAction={projects.length === 0 ? () => setWizardOpen(true) : undefined} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={view === "grid" ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}
            >
              {filtered.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                >
                  <Link href={`/projects/${project.id}`}>
                    <GlassCard className="cursor-pointer overflow-hidden" hoverScale>
                      {/* Gradient Header */}
                      <div className={`h-2 bg-gradient-to-r ${gradientHeaders[i % gradientHeaders.length]}`} />
                      <div className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                              <FolderKanban className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground">{project.name}</h3>
                              <div className="mt-1 flex items-center gap-2">
                                <StageBadge stage={project.stage} />
                                <PulseIndicator
                                  color={project.health === "healthy" ? "green" : "yellow"}
                                  pulse={project.health !== "healthy"}
                                  size="sm"
                                />
                              </div>
                            </div>
                          </div>
                          {/* Avatar Stack */}
                          <div className="flex -space-x-2">
                            {project.members.slice(0, 3).map((m, mi) => (
                              <Avatar key={mi} className="h-7 w-7 border-2 border-background">
                                <AvatarFallback className="bg-muted text-[10px]">{m}</AvatarFallback>
                              </Avatar>
                            ))}
                            {project.members.length > 3 && (
                              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] text-foreground">
                                +{project.members.length - 3}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>

                        {/* Progress Bar */}
                        <div className="mt-3 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="text-foreground">{project.progress}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-accent">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-r from-white to-neutral-400"
                              initial={{ width: 0 }}
                              animate={{ width: `${project.progress}%` }}
                              transition={{ delay: i * 0.06 + 0.3, duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-accent/30 px-2.5 py-1.5">
                          <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">{project.recentActivity}</span>
                        </div>

                        {/* Footer */}
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex gap-1.5">
                            {project.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="bg-muted/80 text-[10px] text-foreground">{tag}</Badge>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(project.updated), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </GlassCard>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
