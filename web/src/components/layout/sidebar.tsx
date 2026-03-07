"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  FolderKanban,
  LayoutTemplate,
  Terminal,
  Brain,
  Database,
  Plug,
  Layers,
  Play,
  FlaskConical,
  Sparkles,
  SlidersHorizontal,
  Cloud,
  Activity,
  Package,
  BarChart3,
  LayoutDashboard,
  Users,
  Box,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/providers/auth-provider";
import { useSidebar } from "@/providers/sidebar-provider";
import { cn } from "@/lib/utils";

const sections = [
  {
    label: "OVERVIEW",
    items: [
      { name: "Dashboard", href: "/", icon: Home },
      { name: "Projects", href: "/projects", icon: FolderKanban },
      { name: "Templates", href: "/templates", icon: LayoutTemplate },
    ],
  },
  {
    label: "DEVELOP",
    items: [
      { name: "Workspaces", href: "/workspaces", icon: Terminal },
      { name: "Models", href: "/models", icon: Brain },
      { name: "Model Registry", href: "/registry", icon: Package },
      { name: "Datasets", href: "/datasets", icon: Database },
      { name: "Data Sources", href: "/data-sources", icon: Plug },
      { name: "Feature Store", href: "/features", icon: Layers },
    ],
  },
  {
    label: "TRAIN",
    items: [
      { name: "Jobs", href: "/training", icon: Play },
      { name: "Hyperparameters", href: "/hyperparameters", icon: SlidersHorizontal },
      { name: "Experiments", href: "/experiments", icon: FlaskConical },
      { name: "AutoML", href: "/automl", icon: Sparkles },
    ],
  },
  {
    label: "ANALYZE",
    items: [
      { name: "Visualizations", href: "/visualizations", icon: BarChart3 },
      { name: "Dashboards", href: "/dashboards", icon: LayoutDashboard },
    ],
  },
  {
    label: "DEPLOY",
    items: [
      { name: "Model APIs", href: "/inference", icon: Cloud },
      { name: "Monitoring", href: "/monitoring", icon: Activity },
    ],
  },
  {
    label: "ADMIN",
    admin: true,
    items: [
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Environments", href: "/admin/environments", icon: Box },
      { name: "System", href: "/admin/system", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const { user } = useAuth();
  // All sections expanded by default
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const isAdmin = user?.role === "admin";

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border bg-background"
    >
      {/* Logo */}
      <div className="relative flex h-[76px] items-center gap-3 px-4 pt-3">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-white/3 to-transparent pointer-events-none" />
        <img src="/openmodelstudio-logo.png" alt="OpenModelStudio" className="relative h-9 w-auto shrink-0 drop-shadow-lg" />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="text-lg font-bold tracking-tight text-foreground"
            >
              OpenModelStudio
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <Separator className="bg-border/50" />

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-4">
        {sections.map((section) => {
          if (section.admin && !isAdmin) return null;
          const isSectionCollapsed = collapsedSections[section.label] ?? false;
          return (
            <div key={section.label} className="mb-3">
              <AnimatePresence>
                {!collapsed && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => toggleSection(section.label)}
                    className="mb-1 flex w-full items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors rounded"
                  >
                    {section.label}
                    <motion.span
                      animate={{ rotate: isSectionCollapsed ? -90 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </motion.span>
                  </motion.button>
                )}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {(!isSectionCollapsed || collapsed) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    {section.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(item.href));
                      const Icon = item.icon;
                      const link = (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                            active
                              ? "bg-white/10 text-white sidebar-active-glow"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4.5 w-4.5 shrink-0 transition-colors",
                              active ? "text-white" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                            )}
                          />
                          <AnimatePresence>
                            {!collapsed && (
                              <motion.span
                                initial={{ opacity: 0, x: -5 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -5 }}
                              >
                                {item.name}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </Link>
                      );

                      if (collapsed) {
                        return (
                          <Tooltip key={item.href} delayDuration={0}>
                            <TooltipTrigger asChild>{link}</TooltipTrigger>
                            <TooltipContent side="right">{item.name}</TooltipContent>
                          </Tooltip>
                        );
                      }
                      return link;
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </ScrollArea>

      <Separator className="bg-border/50" />

      {/* User + Collapse */}
      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-white/15 text-xs text-foreground">
            {user?.name?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <span className="truncate text-sm font-medium text-foreground">
                {user?.name || "User"}
              </span>
              <Badge variant="secondary" className="mt-0.5 w-fit text-[10px]">
                {user?.role || "viewer"}
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={toggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </motion.aside>
  );
}
