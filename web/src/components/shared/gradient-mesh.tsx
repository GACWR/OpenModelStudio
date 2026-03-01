"use client";

import { motion } from "framer-motion";

interface GradientMeshProps {
  className?: string;
  intensity?: "subtle" | "medium" | "strong";
}

export function GradientMesh({ className = "", intensity = "subtle" }: GradientMeshProps) {
  const opacity = intensity === "subtle" ? 0.3 : intensity === "medium" ? 0.5 : 0.7;

  return (
    <div className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${className}`} style={{ opacity }}>
      <motion.div
        className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-white/5 blur-[120px]"
        animate={{
          x: [0, 100, -50, 0],
          y: [0, -80, 60, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 top-1/3 h-[500px] w-[500px] rounded-full bg-white/[0.04] blur-[100px]"
        animate={{
          x: [0, -80, 40, 0],
          y: [0, 60, -40, 0],
          scale: [1, 0.9, 1.1, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-white/[0.03] blur-[80px]"
        animate={{
          x: [0, 60, -30, 0],
          y: [0, -50, 30, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
