"use client";

import { motion } from "framer-motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 opacity-30"
        animate={{
          background: [
            "radial-gradient(circle at 20% 50%, #ffffff 0%, transparent 50%), radial-gradient(circle at 80% 50%, #a3a3a3 0%, transparent 50%)",
            "radial-gradient(circle at 80% 50%, #ffffff 0%, transparent 50%), radial-gradient(circle at 20% 50%, #a3a3a3 0%, transparent 50%)",
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, repeatType: "reverse" }}
      />
      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-white/5 blur-3xl float-orb-1" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-white/[0.04] blur-3xl float-orb-2" />
      <div className="absolute top-1/2 right-1/3 h-48 w-48 rounded-full bg-white/[0.03] blur-3xl float-orb-3" />
      <div className="relative z-10 w-full max-w-md px-4">
        {children}
        <p className="mt-6 text-center text-[10px] text-muted-foreground/50 tracking-wider uppercase">
          Powered by K8s + PyTorch + Rust
        </p>
      </div>
    </div>
  );
}
