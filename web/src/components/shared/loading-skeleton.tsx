"use client";

import { cn } from "@/lib/utils";

function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={style}
      className={cn(
        "animate-pulse rounded-lg bg-accent",
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-accent/30 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Bone className="h-10 w-10 rounded-lg" />
        <div className="space-y-2 flex-1">
          <Bone className="h-4 w-1/3" />
          <Bone className="h-3 w-1/2" />
        </div>
      </div>
      <Bone className="h-3 w-full" />
      <div className="flex gap-2">
        <Bone className="h-5 w-16 rounded-full" />
        <Bone className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-border bg-accent/30 overflow-hidden">
      <div className="border-b border-border p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Bone key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-border/50 p-4 flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Bone key={i} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-accent/30 p-6 flex items-center gap-4">
          <Bone className="h-12 w-12 rounded-xl" />
          <div className="space-y-2 flex-1">
            <Bone className="h-3 w-2/3" />
            <Bone className="h-6 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-border bg-accent/30 p-6">
      <Bone className="h-4 w-1/4 mb-4" />
      <Bone className="w-full" style={{ height }} />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bone className="h-7 w-48" />
          <Bone className="h-4 w-72" />
        </div>
        <Bone className="h-9 w-32 rounded-lg" />
      </div>
      <KPISkeleton />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
