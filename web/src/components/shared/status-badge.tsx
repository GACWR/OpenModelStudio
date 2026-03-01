"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  running: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  completed: "bg-white/10 text-white border-white/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  stopped: "bg-muted text-muted-foreground border-border",
  deployed: "bg-white/10 text-neutral-300 border-white/20",
  healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  degraded: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 text-xs font-medium",
        statusColors[status.toLowerCase()] || statusColors.pending
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", {
          "bg-emerald-400 animate-pulse pulse-glow-emerald": status.toLowerCase() === "running",
          "bg-white": status.toLowerCase() === "completed",
          "bg-red-400": status.toLowerCase() === "failed",
          "bg-amber-400 animate-pulse": status.toLowerCase() === "pending",
          "bg-muted-foreground": status.toLowerCase() === "stopped",
          "bg-neutral-300": status.toLowerCase() === "deployed",
          "bg-emerald-400 breathe": status.toLowerCase() === "healthy",
          "bg-amber-400": status.toLowerCase() === "degraded",
        })}
      />
      {status}
    </Badge>
  );
}
