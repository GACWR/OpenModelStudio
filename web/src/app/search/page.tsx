"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Search as SearchIcon, FolderKanban, Brain, Database, FlaskConical, Zap, Clock, ArrowRight } from "lucide-react";

const categories = [
  { key: "projects", label: "Projects", icon: FolderKanban, color: "#ffffff", bg: "bg-white/10" },
  { key: "models", label: "Models", icon: Brain, color: "#d4d4d4", bg: "bg-white/8" },
  { key: "datasets", label: "Datasets", icon: Database, color: "#10b981", bg: "bg-emerald-500/10" },
  { key: "experiments", label: "Experiments", icon: FlaskConical, color: "#f59e0b", bg: "bg-amber-500/10" },
  { key: "training", label: "Training Jobs", icon: Zap, color: "#a3a3a3", bg: "bg-white/8" },
];

type SearchResult = { id: string; name: string; desc: string; owner: string; updated: string; href: string };
type SearchResults = Record<string, SearchResult[]>;

const emptyResults: SearchResults = {
  projects: [],
  models: [],
  datasets: [],
  experiments: [],
  training: [],
};

// Recent searches from localStorage
function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("oms_recent_searches") || "[]"); } catch { return []; }
}
function addRecentSearch(q: string) {
  if (typeof window === "undefined" || !q.trim()) return;
  const prev = getRecentSearches().filter((s) => s !== q.trim());
  localStorage.setItem("oms_recent_searches", JSON.stringify([q.trim(), ...prev].slice(0, 8)));
}

function SearchContent() {
  const searchParams = useSearchParams();
  const _router = useRouter();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults>(emptyResults);
  const [_searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => { setRecentSearches(getRecentSearches()); }, []);

  const performSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setSearchResults(emptyResults);
      return;
    }
    setSearching(true);
    addRecentSearch(q);
    setRecentSearches(getRecentSearches());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any>(`/search?q=${encodeURIComponent(q)}`)
      .then((data) => {
        const results: SearchResults = { projects: [], models: [], datasets: [], experiments: [], training: [] };
        if (Array.isArray(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.forEach((item: any) => {
            const category = item.type || item.category || "projects";
            const mapped: SearchResult = {
              id: item.id || "",
              name: item.name || item.title || "",
              desc: item.description || item.desc || "",
              owner: item.owner || "Unknown",
              updated: item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "—",
              href: item.href || `/${category}/${item.id}`,
            };
            if (results[category]) results[category].push(mapped);
            else results.projects.push(mapped);
          });
        } else if (data && typeof data === "object") {
          Object.keys(results).forEach((key) => {
            if (Array.isArray(data[key])) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              results[key] = data[key].map((item: any) => ({
                id: item.id || "",
                name: item.name || item.title || "",
                desc: item.description || item.desc || "",
                owner: item.owner || "Unknown",
                updated: item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "—",
                href: item.href || `/${key}/${item.id}`,
              }));
            }
          });
        }
        setSearchResults(results);
      })
      .catch((err) => { toast.error(err instanceof Error ? err.message : "Search failed"); setSearchResults(emptyResults); })
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => performSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const filteredResults = searchResults;

  const totalResults = Object.values(filteredResults).reduce((a, b) => a + b.length, 0);

  return (
    <AppShell>
      <AnimatedPage className="space-y-8">
        {/* Search Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4"
        >
          <h1 className="text-3xl font-bold text-foreground">
            <span className="bg-gradient-to-r from-white via-neutral-300 to-white bg-clip-text text-transparent">
              Search Everything
            </span>
          </h1>
          <p className="text-muted-foreground">Find projects, models, datasets, and experiments</p>
        </motion.div>

        {/* Search Input */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="mx-auto max-w-2xl"
        >
          <div className={`relative rounded-2xl transition-all duration-500 ${
            focused ? "shadow-[0_0_40px_rgba(255,255,255,0.08)]" : ""
          }`}>
            <SearchIcon className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search projects, models, datasets..."
              className="h-14 rounded-2xl border bg-accent/50 pl-14 pr-20 text-lg backdrop-blur-xl input-glow transition-all duration-300"
              autoFocus
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
              <kbd className="rounded border bg-accent px-1.5 py-0.5 text-[10px] font-mono">⌘</kbd>
              <kbd className="rounded border bg-accent px-1.5 py-0.5 text-[10px] font-mono">K</kbd>
            </div>
          </div>
        </motion.div>

        {/* Recent Searches */}
        {!query && recentSearches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mx-auto max-w-2xl"
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Recent Searches</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((s) => (
                <motion.button
                  key={s}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setQuery(s)}
                  className="rounded-lg border bg-accent/50 px-3 py-1.5 text-sm text-foreground hover:border-border hover:bg-accent transition-all"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Results */}
        {query && (
          <div className="mx-auto max-w-2xl space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              {totalResults} results for &quot;{query}&quot;
            </p>
            {totalResults === 0 ? (
              <EmptyState icon={SearchIcon} title="No results found" description={`No matches for "${query}". Try different keywords.`} />
            ) : (
              <div className="space-y-6">
                {categories.map((cat) => {
                  const results = filteredResults[cat.key];
                  if (!results || results.length === 0) return null;
                  const Icon = cat.icon;
                  return (
                    <motion.div
                      key={cat.key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <div className={`flex h-5 w-5 items-center justify-center rounded ${cat.bg}`}>
                          <Icon className="h-3 w-3" style={{ color: cat.color }} />
                        </div>
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat.label}</h2>
                        <Badge variant="outline" className="text-[10px] h-4">{results.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {results.map((r, i) => (
                          <motion.div
                            key={r.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                          >
                            <Link href={r.href}>
                              <GlassCard className="p-4 cursor-pointer group" hoverScale>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-foreground group-hover:text-white transition-colors">{r.name}</p>
                                    <p className="mt-0.5 text-sm text-muted-foreground">{r.desc}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right text-xs text-muted-foreground">
                                      <p>{r.owner}</p>
                                      <p>{r.updated}</p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-white transition-colors" />
                                  </div>
                                </div>
                              </GlassCard>
                            </Link>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Category Quick Links (when no query) */}
        {!query && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mx-auto max-w-2xl"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Browse by Category</p>
            <div className="grid grid-cols-5 gap-3">
              {categories.map((cat, i) => {
                const Icon = cat.icon;
                return (
                  <motion.button
                    key={cat.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    onClick={() => setQuery(cat.label.toLowerCase())}
                    className="flex flex-col items-center gap-2 rounded-xl border bg-accent/30 p-4 hover:border-border hover:bg-accent transition-all"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${cat.bg}`}>
                      <Icon className="h-5 w-5" style={{ color: cat.color }} />
                    </div>
                    <span className="text-xs text-foreground">{cat.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatedPage>
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
