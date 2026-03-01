"use client";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ChatPanel } from "@/components/shared/chat-panel";
import { motion } from "framer-motion";
import { useSidebar } from "@/providers/sidebar-provider";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className={cn("flex flex-1 flex-col transition-all duration-300", collapsed ? "pl-[72px]" : "pl-[260px]")}>
        <Topbar />
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex-1 p-6"
        >
          {children}
        </motion.main>
      </div>
      <ChatPanel />
    </div>
  );
}
