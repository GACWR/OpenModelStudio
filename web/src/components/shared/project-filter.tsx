"use client";

import { FolderKanban } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectFilter } from "@/providers/project-filter-provider";
import { motion } from "framer-motion";

const ALL_PROJECTS = "__all__";

export function ProjectFilter() {
  const { selectedProjectId, setSelectedProjectId, projects, loading } = useProjectFilter();

  if (loading || projects.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <Select
        value={selectedProjectId ?? ALL_PROJECTS}
        onValueChange={(v) => setSelectedProjectId(v === ALL_PROJECTS ? null : v)}
      >
        <SelectTrigger className="h-8 w-auto max-w-[220px] border bg-card/50 gap-2 text-xs">
          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <SelectValue placeholder="All Projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PROJECTS}>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-white/40" />
              All Projects
            </span>
          </SelectItem>
          <SelectSeparator />
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {p.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </motion.div>
  );
}
