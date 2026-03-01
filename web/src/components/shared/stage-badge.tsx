"use client";

import { Badge } from "@/components/ui/badge";

const stageStyles: Record<string, string> = {
  ideation: "bg-white/5 text-neutral-400 border-white/10",
  "data acquisition": "bg-white/8 text-neutral-300 border-white/12",
  "r&d": "bg-white/10 text-neutral-200 border-white/15",
  validation: "bg-white/12 text-neutral-200 border-white/18",
  production: "bg-white/15 text-white border-white/20",
  monitoring: "bg-white/8 text-neutral-300 border-white/12",
};

export function StageBadge({ stage }: { stage: string }) {
  return (
    <Badge
      variant="outline"
      className={stageStyles[stage.toLowerCase()] || stageStyles.ideation}
    >
      {stage}
    </Badge>
  );
}
