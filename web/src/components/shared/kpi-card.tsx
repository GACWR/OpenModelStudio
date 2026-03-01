"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
  suffix?: string;
}

export function KPICard({ title, value, icon: Icon, color, suffix }: KPICardProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 1200;
    const steps = 40;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ scale: 1.02 }}
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm transition-colors hover:border-border card-glow gradient-border-hover">
        <CardContent className="flex items-center gap-4 p-6">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}15` }}
          >
            <Icon className="h-6 w-6" style={{ color }} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">
              {count.toLocaleString()}
              {suffix && <span className="text-lg text-muted-foreground">{suffix}</span>}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
