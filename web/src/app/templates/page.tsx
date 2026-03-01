"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { LayoutTemplate, Search, Play, Brain, Image, Video, Music, MessageSquare, Shield, BarChart3, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  difficulty: string;
  stars: number;
}

const iconMap: Record<string, React.ElementType> = {
  brain: Brain,
  image: Image,
  video: Video,
  music: Music,
  chat: MessageSquare,
  shield: Shield,
  chart: BarChart3,
  sparkles: Sparkles,
};

const categories = ["All", "NLP", "Computer Vision", "Audio", "Generative", "Tabular", "MLOps"];

const difficultyColors: Record<string, string> = {
  Beginner: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Intermediate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Advanced: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const fetchTemplates = () => {
    setLoading(true);
    setError(null);
    api.get<Template[]>("/templates")
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "All" || t.category === category;
    return matchSearch && matchCat;
  });

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start from proven blueprints — one click to launch</p>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <motion.div key={cat} layout transition={{ type: "spring", stiffness: 500, damping: 30 }}>
              <Button
                variant={category === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setCategory(cat)}
                className={`pill-transition ${
                  category === cat ? "bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10" : "border text-muted-foreground"
                }`}
              >
                {cat}
              </Button>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }} className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="border bg-card/50 pl-10 input-glow" />
        </motion.div>

        {error ? (
          <ErrorState message={error} onRetry={fetchTemplates} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={LayoutTemplate} title="No templates found" description="Try a different search or category." />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t, i) => {
              const Icon = iconMap[t.icon] || LayoutTemplate;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ scale: 1.03, y: -4 }}
                >
                  <GlassCard className="p-5 h-full flex flex-col group">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${t.color}15` }}>
                        <Icon className="h-5 w-5" style={{ color: t.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">{t.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="outline" className={difficultyColors[t.difficulty] || ""}>{t.difficulty}</Badge>
                      <Badge variant="secondary" className="bg-muted text-[10px]">{t.category}</Badge>
                      <span className="ml-auto text-xs text-muted-foreground">⭐ {t.stars}</span>
                    </div>
                    <div className="mt-auto pt-4">
                      <Button
                        size="sm"
                        className="w-full gap-2 bg-white/80 text-black hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={async () => {
                          try {
                            const project = await api.post<{ id: string }>("/projects", {
                              name: `${t.name} Project`,
                              description: `Created from template: ${t.name}. ${t.description}`,
                            });
                            toast.success("Project created from template");
                            router.push(`/projects/${project.id}`);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to create project from template");
                          }
                        }}
                      >
                        <Play className="h-3.5 w-3.5" /> Use Template
                      </Button>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
