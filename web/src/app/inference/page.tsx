"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/shared/file-upload";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, Play, Clock, Image as ImageIcon, Video, Music, FileText, Braces, Loader2, Sparkles, Gauge, Hash } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

type InputType = "text" | "image" | "video" | "audio" | "json";

interface InferenceRun {
  id: string;
  model: string;
  inputType: InputType;
  timestamp: string;
  result: string;
  latency?: number;
  tokens?: number;
}

const inputTypes: { value: InputType; label: string; icon: React.ElementType }[] = [
  { value: "text", label: "Text", icon: FileText },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "video", label: "Video", icon: Video },
  { value: "audio", label: "Audio", icon: Music },
  { value: "json", label: "JSON", icon: Braces },
];

export default function InferencePage() {
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [inputType, setInputType] = useState<InputType>("text");
  const [textInput, setTextInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [latency, setLatency] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [history, setHistory] = useState<InferenceRun[]>([]);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/models")
      .then(setModels)
      .catch((err) => { toast.error("Failed to load models: " + (err instanceof Error ? err.message : "Unknown error")); });
  }, []);

  async function runInference() {
    setRunning(true);
    setResult(null);
    setLatency(0);
    setTokens(0);
    const start = Date.now();
    try {
      const res = await api.post<{ output: string; tokens?: number }>("/inference/run", {
        model_id: selectedModel,
        input_type: inputType,
        input: textInput,
      });
      setResult(res.output);
      setLatency(Date.now() - start);
      setTokens(res.tokens || 0);
      setHistory((h) => [{
        id: Date.now().toString(),
        model: models.find((m) => m.id === selectedModel)?.name || selectedModel,
        inputType,
        timestamp: new Date().toLocaleTimeString(),
        result: res.output.substring(0, 50),
        latency: Date.now() - start,
      }, ...h].slice(0, 10));
    } catch {
      toast.error("Inference failed. Please check the model and try again.");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell>
      <AnimatedPage className="space-y-6">
        <div className="flex items-center gap-3">
          <Cloud className="h-6 w-6 text-white" />
          <h1 className="text-2xl font-bold text-foreground">Model Inference</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Panel */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
          <GlassCard className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Input</h2>

            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }} className="space-y-2">
              <label className="text-sm text-muted-foreground">Model</label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="border bg-card/50">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Input Type</label>
              <div className="flex flex-wrap gap-2">
                {inputTypes.map((t) => {
                  const Icon = t.icon;
                  return (
                    <motion.div key={t.value} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant={inputType === t.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setInputType(t.value)}
                        className={`gap-2 ${inputType === t.value ? "bg-white text-black shadow-lg shadow-white/10" : "border"}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {t.label}
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {inputType === "text" || inputType === "json" ? (
              <Textarea
                placeholder={inputType === "json" ? '{"prompt": "..."}' : "Enter your prompt..."}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={6}
                className="font-mono border bg-card/50 input-glow"
              />
            ) : (
              <FileUpload accept={inputType === "image" ? "image/*" : inputType === "video" ? "video/*" : "audio/*"} />
            )}

            {running && (
              <div className="relative h-1.5 rounded-full bg-accent overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-white to-neutral-400"
                  initial={{ width: "0%" }}
                  animate={{ width: "90%" }}
                  transition={{ duration: 3, ease: "easeOut" }}
                />
                <div className="absolute inset-0 shimmer" />
              </div>
            )}

            <Button onClick={runInference} disabled={running || !selectedModel} className="w-full gap-2 bg-white text-black hover:bg-white/90">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Running..." : "Run Inference"}
            </Button>
          </GlassCard>
          </motion.div>

          {/* Output Panel */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
          <GlassCard className="p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">Output</h2>

            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <Sparkles className="h-4 w-4" />
                    <span>Inference complete</span>
                  </div>

                  {/* Latency & Token meters */}
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2">
                      <Gauge className="h-4 w-4 text-white" />
                      <span className="text-xs text-muted-foreground">Latency</span>
                      <AnimatedCounter value={latency} suffix="ms" className="text-sm font-mono font-bold text-foreground" />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2">
                      <Hash className="h-4 w-4 text-neutral-300" />
                      <span className="text-xs text-muted-foreground">Tokens</span>
                      <AnimatedCounter value={tokens} className="text-sm font-mono font-bold text-foreground" />
                    </div>
                  </div>

                  <div className="rounded-lg border bg-background p-4">
                    <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{result}</pre>
                  </div>

                  {/* Media placeholder grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative aspect-video rounded-lg bg-muted/50 border flex items-center justify-center overflow-hidden group cursor-pointer">
                      <Video className="h-8 w-8 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="h-12 w-12 rounded-full bg-accent backdrop-blur flex items-center justify-center">
                          <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <div className="relative aspect-video rounded-lg bg-muted/50 border flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/70" />
                    </div>
                  </div>

                  {/* Audio waveform */}
                  <div className="rounded-lg bg-muted/30 border p-3 flex items-center gap-3">
                    <Music className="h-5 w-5 text-muted-foreground/70 shrink-0" />
                    <div className="flex items-end gap-0.5 h-6 flex-1">
                      {Array.from({ length: 40 }, (_, i) => (
                        <motion.div
                          key={i}
                          className="flex-1 bg-white/20 rounded-full"
                          initial={{ height: "20%" }}
                          animate={{ height: `${20 + Math.sin(i * 0.5) * 60 + Math.random() * 20}%` }}
                          transition={{ delay: i * 0.02 }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex h-48 items-center justify-center text-sm text-muted-foreground/70"
                >
                  Run inference to see results
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
          </motion.div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <Card className="border bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Recent Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((run, i) => (
                  <motion.div
                    key={run.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-4 rounded-lg border bg-background/50 p-3"
                  >
                    <Badge variant="outline" className="shrink-0">{run.inputType}</Badge>
                    <div className="flex-1 truncate">
                      <p className="text-sm font-medium text-foreground">{run.model}</p>
                      <p className="truncate text-xs text-muted-foreground">{run.result}</p>
                    </div>
                    {run.latency && <span className="text-xs font-mono text-muted-foreground/70">{run.latency}ms</span>}
                    <span className="shrink-0 text-xs text-muted-foreground/70">{run.timestamp}</span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </AnimatedPage>
    </AppShell>
  );
}
