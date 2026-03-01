"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { FolderKanban, Brain, Database, FlaskConical, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

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

function SearchOverlay() {
  const { open, setOpen } = useSearch();
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search projects, models, datasets..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick Navigation">
          <CommandItem onSelect={() => navigate("/projects")}>
            <FolderKanban className="mr-2 h-4 w-4" /> Projects
          </CommandItem>
          <CommandItem onSelect={() => navigate("/models")}>
            <Brain className="mr-2 h-4 w-4" /> Models
          </CommandItem>
          <CommandItem onSelect={() => navigate("/datasets")}>
            <Database className="mr-2 h-4 w-4" /> Datasets
          </CommandItem>
          <CommandItem onSelect={() => navigate("/experiments")}>
            <FlaskConical className="mr-2 h-4 w-4" /> Experiments
          </CommandItem>
          <CommandItem onSelect={() => navigate("/training")}>
            <FileText className="mr-2 h-4 w-4" /> Training Jobs
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
