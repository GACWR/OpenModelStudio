"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { PulseIndicator } from "@/components/shared/pulse-indicator";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Users, UserPlus, Search, Shield, Trash2, Mail } from "lucide-react";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created: string;
  lastLogin: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(u: any): UserItem {
  return {
    id: u.id,
    name: u.name || "Unknown",
    email: u.email || "",
    role: u.role || "viewer",
    active: true,
    created: u.created_at ? new Date(u.created_at).toLocaleDateString() : "—",
    lastLogin: "—",
  };
}

const roleConfig: Record<string, { color: string; bg: string; border: string }> = {
  admin: { color: "text-white", bg: "bg-white/10", border: "border-white/20" },
  manager: { color: "text-neutral-300", bg: "bg-white/8", border: "border-white/15" },
  data_scientist: { color: "text-neutral-400", bg: "bg-white/6", border: "border-white/12" },
  viewer: { color: "text-muted-foreground", bg: "bg-slate-500/10", border: "border-slate-500/20" },
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>("/admin/users")
      .then((data) => setUsers(data.map(mapUser)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    setInviting(true);
    try {
      await api.post("/auth/register", { email: inviteEmail.trim(), role: inviteRole });
      toast.success("Invitation sent");
      setInviteOpen(false); setInviteEmail(""); setInviteRole("viewer");
      fetchUsers();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to send invitation"); }
    finally { setInviting(false); }
  };

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = users.filter((u) => u.active).length;

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-white" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">User Management</h1>
              <p className="text-sm text-muted-foreground">
                <AnimatedCounter value={activeCount} className="text-emerald-400 font-semibold" /> active · <AnimatedCounter value={users.length} className="text-foreground font-semibold" /> total
              </p>
            </div>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Button className="gap-2 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10">
                  <UserPlus className="h-4 w-4" /> Invite User
                </Button>
              </motion.div>
            </DialogTrigger>
            <AnimatePresence>
              {inviteOpen && (
                <DialogContent className="border bg-card" forceMount>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <DialogHeader><DialogTitle>Invite User</DialogTitle><DialogDescription>Send an invitation to a new team member.</DialogDescription></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Email Address</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="border bg-muted pl-10 input-glow" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Role</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger className="border bg-muted"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="data_scientist">Data Scientist</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10" onClick={handleInvite} disabled={inviting}>{inviting ? "Sending..." : "Send Invitation"}</Button>
                    </div>
                  </motion.div>
                </DialogContent>
              )}
            </AnimatePresence>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border bg-card/50 pl-10 input-glow"
          />
        </div>

        {/* User Cards */}
        {error ? (
          <ErrorState message={error} onRetry={fetchUsers} />
        ) : users.length === 0 && !loading ? (
          <EmptyState icon={Users} title="No users yet" description="Invite your first team member to get started." actionLabel="Invite User" onAction={() => setInviteOpen(true)} />
        ) : (
        <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="show">
          {filtered.map((u) => {
            const rc = roleConfig[u.role] || roleConfig.viewer;
            return (
              <motion.div
                key={u.id}
                variants={staggerItem}
              >
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-white/15 text-primary-foreground text-sm">
                            {u.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <PulseIndicator
                          color={u.active ? "green" : "gray"}
                          pulse={u.active}
                          size="sm"
                          className="absolute -bottom-0.5 -right-0.5"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{u.name}</p>
                          {u.role === "admin" && <Shield className="h-3.5 w-3.5 text-neutral-300" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className={`${rc.bg} ${rc.color} ${rc.border} text-xs`}>
                        {u.role.replace("_", " ")}
                      </Badge>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Last login</p>
                        <p className="text-foreground">{u.lastLogin}</p>
                      </div>
                      <Switch
                        checked={u.active}
                        onCheckedChange={(checked) =>
                          setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: checked } : x)))
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => { setSelectedUser(u); setDeleteOpen(true); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>
        )}

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Remove ${selectedUser?.name}?`}
          description="This will remove the user from the platform. They will lose access to all projects and workspaces."
          confirmLabel="Remove User"
          variant="danger"
          onConfirm={() => {
            if (selectedUser) setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id));
            setDeleteOpen(false);
          }}
        />
      </AnimatedPage>
    </AppShell>
  );
}
