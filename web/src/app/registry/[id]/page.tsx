"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Package,
  ArrowLeft,
  Download,
  User,
  Tag,
  ExternalLink,
  FileCode,
  BookOpen,
  GitBranch,
  Shield,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

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

export default function RegistryModelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const modelName = decodeURIComponent(params.id as string);

  const [model, setModel] = useState<RegistryModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Source code for each file
  const [fileSources, setFileSources] = useState<Record<string, string>>({});
  const [loadingCode, setLoadingCode] = useState(false);
  const [activeFile, setActiveFile] = useState<string>("");

  // Install dialog
  const [installOpen, setInstallOpen] = useState(false);
  const [installProject, setInstallProject] = useState("");
  const [installing, setInstalling] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Install status
  const [isInstalled, setIsInstalled] = useState(false);

  // Copy state
  const [copied, setCopied] = useState(false);

  const refreshInstallStatus = () => {
    api
      .get<Record<string, boolean>>(`/models/registry-status?names=${modelName}`)
      .then((status) => setIsInstalled(status[modelName] ?? false))
      .catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(REGISTRY_URL).then((r) => {
        if (!r.ok) throw new Error(`Registry fetch failed (${r.status})`);
        return r.json() as Promise<RegistryIndex>;
      }),
      api.get<{ id: string; name: string }[]>("/projects").catch(() => []),
    ])
      .then(([data, projs]) => {
        const found = data.models?.find((m) => m.name === modelName);
        if (!found) {
          setError(`Model "${modelName}" not found in registry`);
          return;
        }
        setModel(found);
        setProjects(projs);
        refreshInstallStatus();

        // Fetch source code for all files
        const files = found.files || ["model.py"];
        setActiveFile(files[0]);
        setLoadingCode(true);
        Promise.all(
          files.map(async (fname) => {
            const url = `${found._registry.raw_url_prefix}/${fname}`;
            try {
              const res = await fetch(url);
              return [fname, res.ok ? await res.text() : `# Failed to load ${fname}`] as const;
            } catch {
              return [fname, `# Failed to load ${fname}`] as const;
            }
          })
        ).then((results) => {
          const sources: Record<string, string> = {};
          for (const [fname, code] of results) {
            sources[fname] = code;
          }
          setFileSources(sources);
          setLoadingCode(false);
        });
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load model")
      )
      .finally(() => setLoading(false));
  }, [modelName]);

  const handleInstall = async () => {
    if (!installProject || !model) {
      toast.error("Select a project");
      return;
    }
    setInstalling(true);
    try {
      const mainFile = model.files?.[0] || "model.py";
      const source_code = fileSources[mainFile] || "";

      await api.post("/sdk/register-model", {
        project_id: installProject,
        name: model.name,
        description: model.description,
        framework: model.framework,
        source_code,
        registry_name: model.name,
      });
      toast.success(`Installed ${model.name} successfully`);
      setIsInstalled(true);
      setInstallOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to install model"
      );
    } finally {
      setInstalling(false);
    }
  };

  const handleCopyInstall = () => {
    navigator.clipboard.writeText(`openmodelstudio install ${modelName}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <AppShell>
        <AnimatedPage className="flex items-center justify-center h-[80vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </AnimatedPage>
      </AppShell>
    );
  }

  if (error || !model) {
    return (
      <AppShell>
        <AnimatedPage>
          <ErrorState
            message={error || "Model not found"}
            onRetry={() => router.push("/registry")}
          />
        </AnimatedPage>
      </AppShell>
    );
  }

  const lang = activeFile.endsWith(".rs")
    ? "rust"
    : activeFile.endsWith(".py")
    ? "python"
    : "plaintext";

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => router.push("/registry")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </motion.div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Package className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {model.name}
              </h1>
              <Badge
                variant="outline"
                className={frameworkColors[model.framework.toLowerCase()] || ""}
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
              <Badge variant="secondary" className="bg-muted text-[10px]">
                v{model.version}
              </Badge>
              {isInstalled && (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                  Installed
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <User className="h-3 w-3" />
                {model.author}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <Shield className="h-3 w-3" />
                {model.license}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {model.homepage && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border text-xs"
                  onClick={() => window.open(model.homepage, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> GitHub
                </Button>
              </motion.div>
            )}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Button
                className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                onClick={() => setInstallOpen(true)}
              >
                <Download className="h-4 w-4" /> {isInstalled ? "Install to Project" : "Install"}
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Content grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        >
          {/* Left: Description + Meta */}
          <motion.div variants={staggerItem} className="space-y-4">
            {/* Description */}
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                About
              </h3>
              <p className="text-sm text-muted-foreground/90 leading-relaxed">
                {model.description}
              </p>
            </GlassCard>

            {/* Quick install */}
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <Download className="h-4 w-4 text-muted-foreground" />
                Quick Install
              </h3>
              <div
                className="flex items-center gap-2 rounded-lg bg-black/30 border border-border/50 px-3 py-2 cursor-pointer group"
                onClick={handleCopyInstall}
              >
                <code className="text-xs text-emerald-400 flex-1 font-mono">
                  openmodelstudio install {model.name}
                </code>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="text-muted-foreground/40 group-hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </motion.div>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-2">
                Or install from the UI with the Install button above.
              </p>
            </GlassCard>

            {/* Tags */}
            {model.tags && model.tags.length > 0 && (
              <GlassCard className="p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {model.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-white/5 border border-white/[0.06] px-2 py-1 text-[11px] text-muted-foreground/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Dependencies */}
            {model.dependencies && model.dependencies.length > 0 && (
              <GlassCard className="p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  Dependencies
                </h3>
                <div className="space-y-1.5">
                  {model.dependencies.map((dep) => (
                    <div
                      key={dep}
                      className="flex items-center gap-2 rounded bg-black/20 px-2.5 py-1.5"
                    >
                      <code className="text-[11px] text-muted-foreground/80 font-mono">
                        {dep}
                      </code>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Files */}
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <FileCode className="h-4 w-4 text-muted-foreground" />
                Files
              </h3>
              <div className="space-y-1.5">
                {model.files.map((fname) => (
                  <button
                    key={fname}
                    onClick={() => setActiveFile(fname)}
                    className={`w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors ${
                      activeFile === fname
                        ? "bg-white/10 text-foreground"
                        : "bg-black/20 text-muted-foreground/80 hover:bg-white/5"
                    }`}
                  >
                    <FileCode className="h-3.5 w-3.5 shrink-0" />
                    <code className="text-[11px] font-mono truncate">{fname}</code>
                  </button>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* Right: Source Code viewer (spans 2 cols) */}
          <motion.div variants={staggerItem} className="lg:col-span-2">
            <GlassCard className="h-full flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {activeFile}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {model.files.length > 1 && (
                    <Tabs value={activeFile} onValueChange={setActiveFile}>
                      <TabsList className="bg-muted/30 h-7">
                        {model.files.map((f) => (
                          <TabsTrigger key={f} value={f} className="text-[10px] px-2 h-5">
                            {f}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0">
                {loadingCode ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <MonacoEditor
                    height="100%"
                    language={lang}
                    theme="vs-dark"
                    value={fileSources[activeFile] || "# Loading..."}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineHeight: 20,
                      padding: { top: 12 },
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      automaticLayout: true,
                      folding: true,
                      bracketPairColorization: { enabled: true },
                      renderWhitespace: "selection",
                    }}
                  />
                )}
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>

        {/* Install Dialog */}
        <Dialog open={installOpen} onOpenChange={setInstallOpen}>
          <DialogContent className="border bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Install Model</DialogTitle>
              <DialogDescription>
                Install{" "}
                <span className="font-medium text-foreground">
                  {model.name}
                </span>{" "}
                into a project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm text-foreground">
                    {model.name}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      frameworkColors[model.framework.toLowerCase()] || ""
                    }`}
                  >
                    {model.framework}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {model.description}
                </p>
              </div>
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
