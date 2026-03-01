"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  hoverGlow?: boolean;
  hoverScale?: boolean;
}

export function GlassCard({
  children,
  className,
  hoverGlow = true,
  hoverScale = false,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      whileHover={hoverScale ? { scale: 1.02 } : undefined}
      className={cn(
        "rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl",
        "shadow-[0_8px_32px_rgba(0,0,0,0.12)]",
        hoverGlow && "transition-shadow duration-500 hover:shadow-[0_0_30px_rgba(255,255,255,0.04),0_0_60px_rgba(255,255,255,0.02)]",
        "hover:border-white/[0.12]",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
