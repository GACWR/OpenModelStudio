"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Package, Search, Download, Tag, User, ExternalLink, ChevronRight } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RegistryMeta {
  path: string;
  raw_url_prefix: string;
}

interface RegistryModel {
  name: string;
  description: string;
  framework: string;
  category: string;
  version: string;
  author: string;
  tags: string[];
  files: string[];
  license: string;
  dependencies: string[];
  homepage: string;
  _registry: RegistryMeta;
}

interface RegistryIndex {
  version: string;
  models: RegistryModel[];
}

const REGISTRY_URL =
  "https://raw.githubusercontent.com/GACWR/open-model-registry/main/registry/index.json";

const frameworkColors: Record<string, string> = {
  pytorch: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  sklearn: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  tensorflow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  jax: "bg-green-500/10 text-green-400 border-green-500/20",
  python: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  rust: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const categoryColors: Record<string, string> = {
  classification: "bg-emerald-500/10 text-emerald-400",
  "computer-vision": "bg-pink-500/10 text-pink-400",
  nlp: "bg-cyan-500/10 text-cyan-400",
  "time-series": "bg-indigo-500/10 text-indigo-400",
  generative: "bg-fuchsia-500/10 text-fuchsia-400",
  regression: "bg-teal-500/10 text-teal-400",
  clustering: "bg-rose-500/10 text-rose-400",
  "anomaly-detection": "bg-red-500/10 text-red-400",
};

const ALL_CATEGORIES = [
  "All",
  "Classification",
  "Computer Vision",
  "NLP",
  "Time Series",
  "Generative",
  "Regression",
  "Clustering",
  "Anomaly Detection",
];

const ALL_FRAMEWORKS = [
  "All",
  "PyTorch",
  "sklearn",
  "TensorFlow",
  "JAX",
  "Python",
  "Rust",
];

function categoryKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

export default function RegistryPage() {
  const [models, setModels] = useState<RegistryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeFramework, setActiveFramework] = useState("All");

  // Install dialog state
  const [installOpen, setInstallOpen] = useState(false);
  const [installModel, setInstallModel] = useState<RegistryModel | null>(null);
  const [installProject, setInstallProject] = useState("");
  const [installing, setInstalling] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const fetchRegistry = () => {
    setLoading(true);
    setError(null);
    fetch(REGISTRY_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch registry (${res.status})`);
        return res.json();
      })
      .then((data: RegistryIndex) => {
        setModels(data.models || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load registry"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRegistry();
    api
      .get<{ id: string; name: string }[]>("/projects")
      .then(setProjects)
      .catch(() => {});
  }, []);

  const handleInstallClick = (model: RegistryModel) => {
    setInstallModel(model);
    setInstallOpen(true);
  };

  const handleInstall = async () => {
    if (!installProject) {
      toast.error("Select a project");
      return;
    }
    if (!installModel) return;
    setInstalling(true);
    try {
      // Fetch the model code from the registry raw URL
      const mainFile = installModel.files?.[0] || "model.py";
      const codeUrl = `${installModel._registry.raw_url_prefix}/${mainFile}`;
      const codeRes = await fetch(codeUrl);
      const source_code = codeRes.ok ? await codeRes.text() : "";

      await api.post("/sdk/register-model", {
        project_id: installProject,
        name: installModel.name,
        description: installModel.description,
        framework: installModel.framework,
        source_code,
      });
      toast.success(`Installed ${installModel.name} successfully`);
      setInstallOpen(false);
      setInstallModel(null);
      setInstallProject("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to install model"
      );
    } finally {
      setInstalling(false);
    }
  };

  const filtered = models.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase()) ||
      m.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory =
      activeCategory === "All" ||
      m.category.toLowerCase() === categoryKey(activeCategory);
    const matchesFramework =
      activeFramework === "All" ||
      m.framework.toLowerCase() === activeFramework.toLowerCase();
    return matchesSearch && matchesCategory && matchesFramework;
  });

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Model Registry
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse and install community models from the Open Model Registry
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              className="gap-2 border"
              onClick={() =>
                window.open(
                  "https://github.com/GACWR/open-model-registry",
                  "_blank"
                )
              }
            >
              <ExternalLink className="h-4 w-4" /> View on GitHub
            </Button>
          </motion.div>
        </div>

        {/* Category filter tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {ALL_CATEGORIES.map((cat) => (
            <motion.button
              key={cat}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                activeCategory === cat
                  ? "bg-white text-black shadow-lg shadow-white/10"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {cat}
            </motion.button>
          ))}
        </div>

        {/* Framework filter badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground/60 mr-1">
            Framework:
          </span>
          {ALL_FRAMEWORKS.map((fw) => (
            <motion.button
              key={fw}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveFramework(fw)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-all duration-200 ${
                activeFramework === fw
                  ? "bg-white/10 text-foreground border-white/20"
                  : "bg-transparent text-muted-foreground border-border/50 hover:bg-white/5 hover:text-foreground"
              }`}
            >
              {fw}
            </motion.button>
          ))}
        </div>

        {/* Animated search bar */}
        <motion.div
          animate={{ width: searchFocused ? "100%" : "320px" }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search models by name, description, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="border bg-card/50 pl-10 input-glow transition-all"
          />
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchRegistry} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No models found"
            description={
              search || activeCategory !== "All" || activeFramework !== "All"
                ? "Try adjusting your search or filters."
                : "The registry is empty. Check back later."
            }
          />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {filtered.map((model) => (
              <motion.div
                key={model.name}
                variants={staggerItem}
                whileHover={{
                  scale: 1.02,
                  rotateX: 2,
                  rotateY: -2,
                }}
                style={{ perspective: 1000 }}
              >
                <Link href={`/registry/${encodeURIComponent(model.name)}`}>
                  <GlassCard className="p-5 h-full flex flex-col cursor-pointer">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                          <Package className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground truncate">
                            {model.name}
                          </h3>
                          <div className="flex items-center gap-1 mt-0.5">
                            <User className="h-3 w-3 text-muted-foreground/60" />
                            <span className="text-[11px] text-muted-foreground/60 truncate">
                              {model.author}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="mt-3 text-xs text-muted-foreground/80 line-clamp-2 flex-1">
                      {model.description}
                    </p>

                    {/* Tags */}
                    {model.tags && model.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {model.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground/70"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {tag}
                          </span>
                        ))}
                        {model.tags.length > 4 && (
                          <span className="text-[10px] text-muted-foreground/50">
                            +{model.tags.length - 4} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Badges + Actions */}
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={
                            frameworkColors[model.framework.toLowerCase()] || ""
                          }
                        >
                          {model.framework}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${
                            categoryColors[model.category.toLowerCase()] || ""
                          }`}
                        >
                          {model.category}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="bg-muted text-[10px]"
                        >
                          v{model.version}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-emerald-400"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleInstallClick(model);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </motion.div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                        >
                          View <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Install Dialog */}
        <Dialog open={installOpen} onOpenChange={setInstallOpen}>
          <DialogContent className="border bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Install Model</DialogTitle>
              <DialogDescription>
                Install{" "}
                <span className="font-medium text-foreground">
                  {installModel?.name}
                </span>{" "}
                into a project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {installModel && (
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm text-foreground">
                      {installModel.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        frameworkColors[
                          installModel.framework.toLowerCase()
                        ] || ""
                      }`}
                    >
                      {installModel.framework}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {installModel.description}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Target Project
                </Label>
                <Select
                  value={installProject}
                  onValueChange={setInstallProject}
                >
                  <SelectTrigger className="border bg-muted">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                disabled={installing}
                onClick={handleInstall}
              >
                <Download className="h-4 w-4" />
                {installing ? "Installing..." : "Install Model"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AnimatedPage>
    </AppShell>
  );
}
