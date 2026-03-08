"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Bell, Brain, Database, FlaskConical, Zap, Monitor, BarChart3, GitBranch, Layers, FolderKanban, CheckCheck, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

function getNotificationIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("training") || t.includes("job")) return Zap;
  if (t.includes("model") || t.includes("version")) return Brain;
  if (t.includes("dataset")) return Database;
  if (t.includes("experiment") || t.includes("run")) return FlaskConical;
  if (t.includes("workspace")) return Monitor;
  if (t.includes("visualization")) return BarChart3;
  if (t.includes("pipeline")) return GitBranch;
  if (t.includes("sweep")) return Layers;
  if (t.includes("project") || t.includes("collaborator")) return FolderKanban;
  if (t.includes("inference")) return Zap;
  return Bell;
}

function getTypeColor(type: string) {
  switch (type) {
    case "success": return "text-emerald-400";
    case "warning": return "text-amber-400";
    case "error": return "text-red-400";
    default: return "text-blue-400";
  }
}

function getTypeBg(type: string) {
  switch (type) {
    case "success": return "bg-emerald-500/10";
    case "warning": return "bg-amber-500/10";
    case "error": return "bg-red-500/10";
    default: return "bg-blue-500/10";
  }
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function groupNotifications(notifications: Notification[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const today: Notification[] = [];
  const thisWeek: Notification[] = [];
  const earlier: Notification[] = [];

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (d >= startOfToday) today.push(n);
    else if (d >= startOfWeek) thisWeek.push(n);
    else earlier.push(n);
  }
  return { today, thisWeek, earlier };
}

export function NotificationPanel() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread count every 30s (only when authenticated)
  const fetchUnreadCount = useCallback(() => {
    if (!api.getToken()) return;
    api.get<{ count: number }>("/notifications/unread-count")
      .then((data) => setUnreadCount(data.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user, fetchUnreadCount]);

  // Fetch full list when popover opens
  useEffect(() => {
    if (open && user) {
      api.get<Notification[]>("/notifications")
        .then(setNotifications)
        .catch(() => {});
    }
  }, [open, user]);

  const handleClick = (n: Notification) => {
    // Mark as read
    if (!n.read) {
      api.post(`/notifications/${n.id}/read`, {}).catch(() => {});
      setNotifications((prev) =>
        prev.map((notif) => (notif.id === n.id ? { ...notif, read: true } : notif))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    // Navigate
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  const markAllRead = () => {
    api.post("/notifications/read-all", {}).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const groups = groupNotifications(notifications);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4.5 w-4.5" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white p-0 px-0.5 text-[9px] text-black">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-0 border bg-popover shadow-xl"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-popover rounded-t-md">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllRead}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Body — fixed max height, self-contained scrolling */}
        <ScrollArea className="h-[min(400px,60vh)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {renderGroup("Today", groups.today, handleClick)}
              {renderGroup("This Week", groups.thisWeek, handleClick)}
              {renderGroup("Earlier", groups.earlier, handleClick)}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function renderGroup(
  label: string,
  items: Notification[],
  onClick: (n: Notification) => void
) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="sticky top-0 z-10 bg-popover px-4 py-1.5 border-b border-border/30">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {items.map((n) => {
        const Icon = getNotificationIcon(n.title);
        const colorClass = getTypeColor(n.notification_type);
        const bgClass = getTypeBg(n.notification_type);
        return (
          <button
            key={n.id}
            onClick={() => onClick(n)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
              !n.read ? "bg-accent/20" : ""
            }`}
          >
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bgClass}`}>
              <Icon className={`h-4 w-4 ${colorClass}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium truncate ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>
                  {n.title}
                </p>
                {!n.read && (
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{n.message}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">{timeAgo(n.created_at)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
