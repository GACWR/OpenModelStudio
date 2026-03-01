"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage, staggerContainer, staggerItem } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, User, Bell, Key, Copy, Trash2, Plus, Palette, Server, AlertTriangle, Check, Upload, Brain, Loader2, Zap } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  created: string;
  lastUsed: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiKey(k: any): ApiKeyItem {
  return {
    id: k.id,
    name: k.name || "Unnamed Key",
    prefix: k.prefix || "sk-...",
    created: k.created_at ? new Date(k.created_at).toLocaleDateString() : "—",
    lastUsed: k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never",
  };
}

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
  ollama: ["llama3.2", "mistral", "codellama"],
};

const PROVIDER_META: Record<string, { label: string; color: string; placeholder: string; needsKey: boolean; needsUrl: boolean; defaultUrl: string }> = {
  openai: { label: "OpenAI", color: "bg-green-400", placeholder: "sk-...", needsKey: true, needsUrl: false, defaultUrl: "https://api.openai.com" },
  anthropic: { label: "Anthropic", color: "bg-orange-400", placeholder: "sk-ant-...", needsKey: true, needsUrl: false, defaultUrl: "https://api.anthropic.com" },
  ollama: { label: "Ollama", color: "bg-purple-400", placeholder: "", needsKey: false, needsUrl: true, defaultUrl: "http://localhost:11434" },
};

interface ProviderCfg {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

interface LLMProvidersConfig {
  providers: Record<string, ProviderCfg>;
  activeProvider: string;
  activeModel: string;
}

const DEFAULT_LLM_CONFIG: LLMProvidersConfig = {
  providers: {
    openai: { enabled: false, apiKey: "", baseUrl: "https://api.openai.com", defaultModel: "gpt-4o" },
    anthropic: { enabled: false, apiKey: "", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-20250514" },
    ollama: { enabled: false, apiKey: "", baseUrl: "http://localhost:11434", defaultModel: "llama3.2" },
  },
  activeProvider: "anthropic",
  activeModel: "claude-sonnet-4-20250514",
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [_loadingKeys, setLoadingKeys] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [slackNotifs, setSlackNotifs] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [activeTheme, setActiveTheme] = useState("Dark");
  const [activeAccent, setActiveAccent] = useState("#ffffff");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [genKeyOpen, setGenKeyOpen] = useState(false);
  const [genKeyName, setGenKeyName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [k8sCluster, setK8sCluster] = useState("");
  const [k8sNamespace, setK8sNamespace] = useState("");
  const [k8sToken, setK8sToken] = useState("");
  const [llmConfig, setLlmConfig] = useState<LLMProvidersConfig>(DEFAULT_LLM_CONFIG);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const [_keysError, setKeysError] = useState<string | null>(null);

  const fetchKeys = () => {
    setLoadingKeys(true);
    setKeysError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>("/api-keys")
      .then((data) => setApiKeys(data.map(mapApiKey)))
      .catch((err) => setKeysError(err instanceof Error ? err.message : "Failed to load API keys"))
      .finally(() => setLoadingKeys(false));
  };

  useEffect(() => {
    fetchKeys();
    if (user) {
      setProfileName(user.name || "");
      setProfileEmail(user.email || "");
    }
    // Load persisted settings from localStorage
    try {
      const k8s = JSON.parse(localStorage.getItem("k8s_config") || "{}");
      if (k8s.cluster) setK8sCluster(k8s.cluster);
      if (k8s.namespace) setK8sNamespace(k8s.namespace);
      if (k8s.token) setK8sToken(k8s.token);
      const llm = localStorage.getItem("llm_providers");
      if (llm) {
        try {
          const parsed = JSON.parse(llm);
          if (parsed.providers) setLlmConfig(parsed);
        } catch {}
      }
    } catch {}
  }, [user]);

  const copyKey = (id: string) => {
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateKey = async () => {
    if (!genKeyName.trim()) { toast.error("Key name is required"); return; }
    setGenerating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.post<any>("/api-keys", { name: genKeyName.trim() });
      toast.success(`Key created: ${res.key}`);
      setGenKeyOpen(false);
      setGenKeyName("");
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate key");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await api.delete(`/api-keys/${id}`);
      toast.success("Key deleted");
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete key");
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.put("/auth/me", { name: profileName, email: profileEmail });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const updateProvider = (provider: string, field: keyof ProviderCfg, value: string | boolean) => {
    setLlmConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          [field]: value,
        },
      },
    }));
  };

  const handleSaveLlmConfig = () => {
    localStorage.setItem("llm_providers", JSON.stringify(llmConfig));
    toast.success("AI model configuration saved");
  };

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider);
    const cfg = llmConfig.providers[provider];
    try {
      if (provider === "openai") {
        const resp = await fetch(`${cfg.baseUrl || "https://api.openai.com"}/v1/models`, {
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        toast.success("OpenAI connection successful");
      } else if (provider === "anthropic") {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: cfg.defaultModel || "claude-sonnet-4-20250514",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        toast.success("Anthropic connection successful");
      } else if (provider === "ollama") {
        const resp = await fetch(`${cfg.baseUrl || "http://localhost:11434"}/api/tags`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        toast.success("Ollama connection successful");
      }
    } catch (err) {
      toast.error(`Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <AppShell>
      <AnimatedPage>
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-white" />
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-card/50 border border">
              <TabsTrigger value="profile" className="gap-2"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
              <TabsTrigger value="keys" className="gap-2"><Key className="h-3.5 w-3.5" /> API Keys</TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2"><Bell className="h-3.5 w-3.5" /> Notifications</TabsTrigger>
              <TabsTrigger value="appearance" className="gap-2"><Palette className="h-3.5 w-3.5" /> Appearance</TabsTrigger>
              <TabsTrigger value="ai-models" className="gap-2"><Brain className="h-3.5 w-3.5" /> AI Models</TabsTrigger>
              <TabsTrigger value="k8s" className="gap-2"><Server className="h-3.5 w-3.5" /> K8s Config</TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <TabsContent value="profile" forceMount={activeTab === "profile" ? true : undefined} className={activeTab !== "profile" ? "hidden" : ""}>
                  <GlassCard className="p-6 space-y-6">
                    {/* Avatar */}
                    <div className="flex items-center gap-5">
                      <div className="relative group">
                        <Avatar className="h-20 w-20">
                          <AvatarFallback className="bg-white/15 text-2xl text-primary-foreground">
                            {user?.name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <motion.div
                          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          whileHover={{ scale: 1.05 }}
                        >
                          <Upload className="h-5 w-5 text-primary-foreground" />
                        </motion.div>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{user?.name || "User"}</p>
                        <p className="text-sm text-muted-foreground">{user?.email || "user@example.com"}</p>
                        <Button variant="outline" size="sm" className="mt-2 border text-xs opacity-50 cursor-not-allowed" disabled>Change Avatar</Button>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">Avatar upload coming soon</p>
                      </div>
                    </div>
                    <Separator className="bg-border" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Display Name</Label>
                        <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="border bg-accent/50 input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <Input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} type="email" className="border bg-accent/50 input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Username</Label>
                        <Input defaultValue={user?.name?.toLowerCase().replace(/\s/g, ".") || ""} className="border bg-accent/50 input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Organization</Label>
                        <Input placeholder="Your organization" className="border bg-accent/50 input-glow" />
                      </div>
                    </div>
                    <Button className="bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10" disabled={savingProfile} onClick={handleSaveProfile}>{savingProfile ? "Saving..." : "Save Changes"}</Button>
                  </GlassCard>
                </TabsContent>

                <TabsContent value="keys" forceMount={activeTab === "keys" ? true : undefined} className={activeTab !== "keys" ? "hidden" : ""}>
                  <GlassCard className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">API Keys</h3>
                        <p className="text-xs text-muted-foreground">Manage your API access tokens</p>
                      </div>
                      <Dialog open={genKeyOpen} onOpenChange={setGenKeyOpen}>
                        <DialogTrigger asChild>
                          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button size="sm" className="gap-2 bg-white text-black hover:bg-white/90"><Plus className="h-3.5 w-3.5" /> Generate Key</Button>
                          </motion.div>
                        </DialogTrigger>
                        <DialogContent className="border bg-card">
                          <DialogHeader><DialogTitle>Generate API Key</DialogTitle></DialogHeader>
                          <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                              <Label>Key Name</Label>
                              <Input placeholder="my-api-key" value={genKeyName} onChange={(e) => setGenKeyName(e.target.value)} className="border bg-muted" />
                            </div>
                            <Button className="w-full bg-white text-black hover:bg-white/90" disabled={generating} onClick={handleGenerateKey}>{generating ? "Generating..." : "Generate Key"}</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="show">
                      {apiKeys.map((k) => (
                        <motion.div
                          key={k.id}
                          variants={staggerItem}
                          className="flex items-center justify-between rounded-xl border border bg-accent/30 p-4"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{k.name}</p>
                            <p className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                              {k.prefix}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground/70">Last used {k.lastUsed}</span>
                            <motion.div whileHover={{ scale: 1.1 }}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyKey(k.id)}>
                                {copiedKey === k.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            </motion.div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => handleDeleteKey(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </GlassCard>
                </TabsContent>

                <TabsContent value="notifications" forceMount={activeTab === "notifications" ? true : undefined} className={activeTab !== "notifications" ? "hidden" : ""}>
                  <GlassCard className="p-6 space-y-1">
                    {[
                      { label: "Email Notifications", desc: "Receive updates about training jobs and deployments", checked: emailNotifs, onChange: setEmailNotifs },
                      { label: "Slack Notifications", desc: "Push alerts to your Slack workspace", checked: slackNotifs, onChange: setSlackNotifs },
                      { label: "Browser Push", desc: "Desktop notifications for critical events", checked: false, onChange: () => {} },
                      { label: "Job Completion", desc: "Get notified when training jobs finish", checked: true, onChange: () => {} },
                    ].map((item, i) => (
                      <motion.div key={item.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                        <div className="flex items-center justify-between py-4">
                          <div>
                            <p className="text-sm text-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                          <Switch checked={item.checked} onCheckedChange={item.onChange} />
                        </div>
                        {i < 3 && <Separator className="bg-border" />}
                      </motion.div>
                    ))}
                  </GlassCard>
                </TabsContent>

                <TabsContent value="appearance" forceMount={activeTab === "appearance" ? true : undefined} className={activeTab !== "appearance" ? "hidden" : ""}>
                  <GlassCard className="p-6 space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-4">Theme</h3>
                      <div className="flex gap-4">
                        {[
                          { name: "Dark", bg: "bg-slate-900", border: "border-slate-700" },
                          { name: "Light", bg: "bg-white", border: "border-slate-300" },
                          { name: "System", bg: "bg-gradient-to-r from-slate-900 to-white", border: "border-slate-600" },
                        ].map((t) => (
                          <motion.button
                            key={t.name}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setActiveTheme(t.name); toast.success(`Theme set to ${t.name}`); }}
                            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                              activeTheme === t.name ? "border-white ring-2 ring-white/30 shadow-lg shadow-white/10" : "border hover:border-border"
                            }`}
                          >
                            <div className={`h-16 w-24 rounded-lg ${t.bg} ${t.border} border`} />
                            <span className="text-xs text-muted-foreground">{t.name}</span>
                            {activeTheme === t.name && <Badge className="bg-white/10 text-white border-white/20 text-[10px]">Active</Badge>}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                    <Separator className="bg-border" />
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-4">Accent Color</h3>
                      <div className="flex gap-3">
                        {["#ffffff", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#262626"].map((color) => (
                          <motion.button
                            key={color}
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => { setActiveAccent(color); toast.success("Accent color updated"); }}
                            className={`h-8 w-8 rounded-full ${activeAccent === color ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background" : ""}`}
                            style={{ background: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </GlassCard>
                </TabsContent>

                <TabsContent value="ai-models" forceMount={activeTab === "ai-models" ? true : undefined} className={activeTab !== "ai-models" ? "hidden" : ""}>
                  <div className="space-y-4">
                    {/* Active model selector */}
                    <GlassCard className="p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Default Model</h3>
                      <p className="text-xs text-muted-foreground">Select the model used by the AI assistant by default.</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Provider</Label>
                          <Select
                            value={llmConfig.activeProvider}
                            onValueChange={(v) => {
                              const models = PROVIDER_MODELS[v] || [];
                              setLlmConfig(prev => ({ ...prev, activeProvider: v, activeModel: models[0] || "" }));
                            }}
                          >
                            <SelectTrigger className="border bg-accent/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PROVIDER_META).map(([key, meta]) => (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-2">
                                    <span className={`inline-block h-2 w-2 rounded-full ${meta.color}`} />
                                    {meta.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Model</Label>
                          <Select
                            value={llmConfig.activeModel}
                            onValueChange={(v) => setLlmConfig(prev => ({ ...prev, activeModel: v }))}
                          >
                            <SelectTrigger className="border bg-accent/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(PROVIDER_MODELS[llmConfig.activeProvider] || []).map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Per-provider config cards */}
                    {Object.entries(PROVIDER_META).map(([key, meta]) => {
                      const cfg = llmConfig.providers[key] || { enabled: false, apiKey: "", baseUrl: meta.defaultUrl, defaultModel: "" };
                      return (
                        <GlassCard key={key} className="p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`h-3 w-3 rounded-full ${meta.color}`} />
                              <h4 className="text-sm font-semibold text-foreground">{meta.label}</h4>
                              {cfg.enabled && <Badge variant="secondary" className="text-[10px]">Enabled</Badge>}
                            </div>
                            <Switch
                              checked={cfg.enabled}
                              onCheckedChange={(v) => updateProvider(key, "enabled", v)}
                            />
                          </div>
                          <AnimatePresence>
                            {cfg.enabled && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3 overflow-hidden"
                              >
                                {meta.needsKey && (
                                  <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">API Key</Label>
                                    <Input
                                      type="password"
                                      placeholder={meta.placeholder}
                                      value={cfg.apiKey}
                                      onChange={(e) => updateProvider(key, "apiKey", e.target.value)}
                                      className="border bg-accent/50 input-glow"
                                    />
                                  </div>
                                )}
                                {meta.needsUrl && (
                                  <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Base URL</Label>
                                    <Input
                                      placeholder={meta.defaultUrl}
                                      value={cfg.baseUrl}
                                      onChange={(e) => updateProvider(key, "baseUrl", e.target.value)}
                                      className="border bg-accent/50 input-glow"
                                    />
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Default Model</Label>
                                  <Select
                                    value={cfg.defaultModel}
                                    onValueChange={(v) => updateProvider(key, "defaultModel", v)}
                                  >
                                    <SelectTrigger className="border bg-accent/50">
                                      <SelectValue placeholder="Select model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(PROVIDER_MODELS[key] || []).map((m) => (
                                        <SelectItem key={m} value={m}>{m}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  disabled={testingProvider === key}
                                  onClick={() => handleTestConnection(key)}
                                >
                                  {testingProvider === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                  Test Connection
                                </Button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </GlassCard>
                      );
                    })}

                    <Button
                      className="w-full bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                      onClick={handleSaveLlmConfig}
                    >
                      Save AI Model Configuration
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="k8s" forceMount={activeTab === "k8s" ? true : undefined} className={activeTab !== "k8s" ? "hidden" : ""}>
                  <GlassCard className="p-6 space-y-4">
                    <h3 className="text-base font-semibold text-foreground">Kubernetes Configuration</h3>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Cluster URL</Label>
                        <Input placeholder="https://k8s.example.com" value={k8sCluster} onChange={(e) => setK8sCluster(e.target.value)} className="border bg-accent/50 input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Namespace</Label>
                        <Input placeholder="openmodelstudio" value={k8sNamespace} onChange={(e) => setK8sNamespace(e.target.value)} className="border bg-accent/50 input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Service Account Token</Label>
                        <Input type="password" placeholder="••••••••" value={k8sToken} onChange={(e) => setK8sToken(e.target.value)} className="border bg-accent/50 input-glow" />
                      </div>
                    </div>
                    <Button className="bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10" onClick={() => { localStorage.setItem("k8s_config", JSON.stringify({ cluster: k8sCluster, namespace: k8sNamespace, token: k8sToken })); toast.success("Configuration saved"); }}>Save Configuration</Button>
                  </GlassCard>
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </Tabs>

          {/* Danger Zone */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-6 space-y-4"
          >
            <h3 className="flex items-center gap-2 text-base font-semibold text-red-400">
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </h3>
            <p className="text-sm text-muted-foreground">Once you delete your account, there is no going back.</p>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="shadow-lg shadow-red-500/10">
              Delete Account
            </Button>
          </motion.div>

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete Account?"
            description="This will permanently delete your account and all associated data. This action cannot be undone."
            confirmLabel="Delete Account"
            variant="danger"
            onConfirm={() => { api.delete("/auth/account").then(() => setDeleteOpen(false)).catch((err) => toast.error(err instanceof Error ? err.message : "Failed to delete account")); }}
          />
        </div>
      </AnimatedPage>
    </AppShell>
  );
}
