"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  FolderKanban, Brain, Database, FlaskConical, Zap, Monitor,
  BarChart3, Layers, Plug,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface SearchContextType {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const SearchContext = createContext<SearchContextType>({
  open: false,
  setOpen: () => {},
});

export const useSearch = () => useContext(SearchContext);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <SearchContext.Provider value={{ open, setOpen }}>
      {children}
      <SearchOverlay />
    </SearchContext.Provider>
  );
}

interface SearchItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  href: string;
  icon_hint: string | null;
  status: string | null;
  updated_at: string | null;
}

interface SearchResults {
  projects: SearchItem[];
  models: SearchItem[];
  datasets: SearchItem[];
  experiments: SearchItem[];
  training: SearchItem[];
  workspaces: SearchItem[];
  features: SearchItem[];
  visualizations: SearchItem[];
  data_sources: SearchItem[];
}

const categoryConfig: { key: keyof SearchResults; label: string; icon: typeof Brain }[] = [
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "models", label: "Models", icon: Brain },
  { key: "datasets", label: "Datasets", icon: Database },
  { key: "experiments", label: "Experiments", icon: FlaskConical },
  { key: "training", label: "Training Jobs", icon: Zap },
  { key: "workspaces", label: "Workspaces", icon: Monitor },
  { key: "features", label: "Features", icon: Layers },
  { key: "visualizations", label: "Visualizations", icon: BarChart3 },
  { key: "data_sources", label: "Data Sources", icon: Plug },
];

const quickNav = [
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Models", href: "/models", icon: Brain },
  { label: "Datasets", href: "/datasets", icon: Database },
  { label: "Experiments", href: "/experiments", icon: FlaskConical },
  { label: "Training Jobs", href: "/training", icon: Zap },
  { label: "Workspaces", href: "/workspaces", icon: Monitor },
  { label: "Features", href: "/features", icon: Layers },
  { label: "Monitoring", href: "/monitoring", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Plug },
];

function SearchOverlay() {
  const { open, setOpen } = useSearch();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setResults(null);
      router.push(href);
    },
    [router, setOpen]
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      api.get<SearchResults>(`/search?q=${encodeURIComponent(query)}&limit=5`)
        .then(setResults)
        .catch((err) => {
          setResults(null);
          if (err instanceof Error && err.message !== "Unauthorized") {
            toast.error("Search failed");
          }
        })
        .finally(() => setLoading(false));
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const hasResults = results && Object.values(results).some((arr) => arr.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Search projects, models, datasets..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* No query → show quick navigation */}
        {!query.trim() && (
          <CommandGroup heading="Quick Navigation">
            {quickNav.map((item) => (
              <CommandItem key={item.href} onSelect={() => navigate(item.href)}>
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Query with no results */}
        {query.trim() && !loading && !hasResults && (
          <CommandEmpty>No results found for &ldquo;{query}&rdquo;</CommandEmpty>
        )}

        {/* Live search results */}
        {query.trim() && results && categoryConfig.map(({ key, label, icon: Icon }) => {
          const items = results[key];
          if (!items || items.length === 0) return null;
          return (
            <CommandGroup key={key} heading={label}>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => navigate(item.href)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{item.name}</span>
                    {item.status && (
                      <span className="text-[10px] rounded bg-accent px-1.5 py-0.5 text-muted-foreground shrink-0">
                        {item.status}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <span className="ml-2 text-xs text-muted-foreground truncate max-w-[200px]">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {/* View all results link */}
        {query.trim() && hasResults && (
          <CommandGroup>
            <CommandItem
              onSelect={() => navigate(`/search?q=${encodeURIComponent(query)}`)}
              className="justify-center text-muted-foreground"
            >
              View all results
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
