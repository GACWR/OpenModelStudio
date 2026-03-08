"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
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
  refetchProjects: () => void;
}

const ProjectFilterContext = createContext<ProjectFilterContextValue>({
  selectedProjectId: null,
  setSelectedProjectId: () => {},
  projects: [],
  loading: true,
  refetchProjects: () => {},
});

export function ProjectFilterProvider({ children }: { children: React.ReactNode }) {
  const [selectedProjectId, setSelectedState] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem("oms_project_filter");
    if (stored && stored !== "null") setSelectedState(stored);
  }, []);

  const fetchProjects = useCallback(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    api.get<Project[]>("/projects")
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Refetch whenever user logs in or navigates to a different page
  useEffect(() => {
    fetchProjects();
  }, [user, pathname, fetchProjects]);

  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedState(id);
    localStorage.setItem("oms_project_filter", id ?? "null");
  }, []);

  return (
    <ProjectFilterContext.Provider value={{ selectedProjectId, setSelectedProjectId, projects, loading, refetchProjects: fetchProjects }}>
      {children}
    </ProjectFilterContext.Provider>
  );
}

export const useProjectFilter = () => useContext(ProjectFilterContext);
