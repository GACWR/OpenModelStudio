"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

interface Project {
  id: string;
  name: string;
}

interface ProjectFilterContextValue {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  projects: Project[];
  loading: boolean;
}

const ProjectFilterContext = createContext<ProjectFilterContextValue>({
  selectedProjectId: null,
  setSelectedProjectId: () => {},
  projects: [],
  loading: true,
});

export function ProjectFilterProvider({ children }: { children: React.ReactNode }) {
  const [selectedProjectId, setSelectedState] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("oms_project_filter");
    if (stored && stored !== "null") setSelectedState(stored);
  }, []);

  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    api.get<Project[]>("/projects")
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedState(id);
    localStorage.setItem("oms_project_filter", id ?? "null");
  }, []);

  return (
    <ProjectFilterContext.Provider value={{ selectedProjectId, setSelectedProjectId, projects, loading }}>
      {children}
    </ProjectFilterContext.Provider>
  );
}

export const useProjectFilter = () => useContext(ProjectFilterContext);
