"use client";

import { cn } from "@/lib/utils";

const colorMap: Record<string, { dot: string; ping: string }> = {
  green: { dot: "bg-emerald-400", ping: "bg-emerald-400" },
  red: { dot: "bg-red-400", ping: "bg-red-400" },
  yellow: { dot: "bg-amber-400", ping: "bg-amber-400" },
  blue: { dot: "bg-white", ping: "bg-white" },
  purple: { dot: "bg-neutral-400", ping: "bg-neutral-400" },
  gray: { dot: "bg-muted-foreground", ping: "bg-muted-foreground" },
};

interface PulseIndicatorProps {
  color?: keyof typeof colorMap;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

export function PulseIndicator({
  color = "green",
  size = "sm",
  pulse = true,
  className,
}: PulseIndicatorProps) {
  const c = colorMap[color] || colorMap.green;
  const s = size === "sm" ? "h-2 w-2" : size === "md" ? "h-3 w-3" : "h-4 w-4";

  return (
    <span className={cn("relative inline-flex", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            c.ping
          )}
        />
      )}
      <span className={cn("relative inline-flex rounded-full", s, c.dot)} />
    </span>
  );
}
