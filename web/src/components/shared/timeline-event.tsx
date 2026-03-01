"use client";

import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

interface TimelineEventProps {
  user: string;
  action: string;
  target: string;
  timestamp: string;
  index?: number;
}

export function TimelineEvent({ user, action, target, timestamp, index = 0 }: TimelineEventProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="flex items-start gap-3 py-3"
    >
      <div className="relative flex flex-col items-center">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
            {user.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="mt-1 h-full w-px bg-border/50" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{user}</span>{" "}
          {action}{" "}
          <span className="font-medium text-white">{target}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </p>
      </div>
    </motion.div>
  );
}
