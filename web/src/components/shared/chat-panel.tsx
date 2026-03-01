"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Brain,
  Wrench,
  StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolName?: string;
  toolStatus?: string;
}

interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface LLMProviders {
  providers: Record<string, ProviderConfig>;
  activeProvider: string;
  activeModel: string;
}

interface ModelOption {
  provider: string;
  model: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Static model lists per provider + provider color
// ---------------------------------------------------------------------------

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
  ollama: ["llama3.2", "mistral", "codellama"],
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-green-400",
  anthropic: "bg-orange-400",
  ollama: "bg-purple-400",
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readProviders(): LLMProviders | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("llm_providers");
    if (!raw) return null;
    return JSON.parse(raw) as LLMProviders;
  } catch {
    return null;
  }
}

function buildModelList(config: LLMProviders | null): ModelOption[] {
  const models: ModelOption[] = [];
  if (!config) return models;
  for (const [provider, cfg] of Object.entries(config.providers)) {
    if (!cfg.enabled) continue;
    const providerModels = PROVIDER_MODELS[provider] ?? [];
    for (const model of providerModels) {
      models.push({
        provider,
        model,
        color: PROVIDER_COLORS[provider] ?? "bg-gray-400",
      });
    }
  }
  return models;
}

/** Encode a model option as a single select value string. */
function encodeModelValue(provider: string, model: string) {
  return `${provider}::${model}`;
}

function decodeModelValue(value: string): { provider: string; model: string } {
  const [provider, ...rest] = value.split("::");
  return { provider, model: rest.join("::") };
}

// ---------------------------------------------------------------------------
// Markdown components
// ---------------------------------------------------------------------------

const markdownComponents = {
  code({
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<"code"> & { className?: string }) {
    const isInline = !className;
    return isInline ? (
      <code
        className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono"
        {...props}
      >
        {children}
      </code>
    ) : (
      <code
        className="block rounded-lg bg-white/5 p-3 text-xs font-mono overflow-x-auto"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }: React.ComponentPropsWithoutRef<"pre">) {
    return <pre className="my-2 overflow-hidden rounded-lg">{children}</pre>;
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatPanel() {
  // -- panel open/close
  const [open, setOpen] = useState(false);

  // -- messages
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hi! I'm your AI assistant. I can help you create projects, manage models, start training jobs, and more. How can I help?",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // -- model selection
  const [providerConfig, setProviderConfig] = useState<LLMProviders | null>(
    null
  );
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [modelList, setModelList] = useState<ModelOption[]>([]);

  // -- drag
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Load provider config from localStorage on mount
  useEffect(() => {
    const cfg = readProviders();
    setProviderConfig(cfg);
    const models = buildModelList(cfg);
    setModelList(models);

    // Default selection
    if (cfg?.activeProvider && cfg?.activeModel) {
      setSelectedValue(encodeModelValue(cfg.activeProvider, cfg.activeModel));
    } else if (models.length > 0) {
      setSelectedValue(encodeModelValue(models[0].provider, models[0].model));
    }
  }, [open]); // re-read when panel opens in case settings changed

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------
  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setStreaming(true);

    // Determine provider + model
    const { provider, model } = selectedValue
      ? decodeModelValue(selectedValue)
      : { provider: "anthropic", model: "claude-sonnet-4-20250514" };

    const providerCfg = providerConfig?.providers?.[provider];

    // Build conversation history (role + content only)
    const conversationHistory = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Create assistant placeholder
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/llm/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(api.getToken()
            ? { Authorization: `Bearer ${api.getToken()}` }
            : {}),
        },
        body: JSON.stringify({
          messages: conversationHistory,
          provider,
          model,
          api_key: providerCfg?.apiKey,
          base_url: providerCfg?.baseUrl,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${response.status} - ${errText}` }
              : m
          )
        );
        setStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Error: No response stream." }
              : m
          )
        );
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6); // remove "data: "
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === "thinking") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: (m.thinking ?? "") + parsed.content }
                    : m
                )
              );
            } else if (parsed.type === "text") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            } else if (parsed.type === "tool") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolName: parsed.name,
                        toolStatus: parsed.status,
                      }
                    : m
                )
              );
            } else if (parsed.type === "done") {
              // Clear tool indicator on done
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolName: undefined, toolStatus: undefined }
                    : m
                )
              );
              break;
            }
          } catch {
            // Not valid JSON, skip
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
                }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, selectedValue, providerConfig]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Group models by provider for the select dropdown
  const groupedModels = modelList.reduce<Record<string, ModelOption[]>>(
    (acc, opt) => {
      (acc[opt.provider] ??= []).push(opt);
      return acc;
    },
    {}
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <>
      {/* Drag constraints wrapper — covers the entire viewport */}
      <div ref={constraintsRef} className="fixed inset-0 z-40 pointer-events-none" />

      {/* Floating trigger button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              size="lg"
              onClick={() => setOpen(true)}
              className="h-14 w-14 rounded-full bg-white shadow-lg shadow-white/10 hover:shadow-white/20"
            >
              <MessageCircle className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={constraintsRef}
            className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[420px] flex-col overflow-hidden rounded-2xl border bg-background/95 backdrop-blur-xl shadow-2xl"
          >
            {/* ---- Header (drag handle) ---- */}
            <div
              className="flex items-center justify-between border-b border-border/50 px-4 py-3 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    AI Assistant
                  </p>
                </div>
              </div>

              {/* Model selector */}
              <div
                className="flex-1 mx-3 min-w-0"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {modelList.length > 0 ? (
                  <Select
                    value={selectedValue}
                    onValueChange={setSelectedValue}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-full h-7 text-[11px] border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[60]">
                      {Object.entries(groupedModels).map(
                        ([provider, options]) => (
                          <SelectGroup key={provider}>
                            <SelectLabel className="text-[10px] uppercase tracking-wider">
                              {PROVIDER_LABELS[provider] ?? provider}
                            </SelectLabel>
                            {options.map((opt) => (
                              <SelectItem
                                key={encodeModelValue(opt.provider, opt.model)}
                                value={encodeModelValue(
                                  opt.provider,
                                  opt.model
                                )}
                                className="text-xs"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`inline-block h-2 w-2 rounded-full ${opt.color}`}
                                  />
                                  <span className="truncate">{opt.model}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-[11px] text-muted-foreground/60 truncate block">
                    No models configured
                  </span>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* ---- Messages ---- */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {msg.role === "assistant" && (
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-white/15 text-[10px] text-foreground">
                          AI
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-white/15 text-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {/* Thinking block */}
                      {msg.thinking && (
                        <details className="mb-2 rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
                          <summary className="px-3 py-2 text-[11px] font-medium text-muted-foreground/70 cursor-pointer hover:text-muted-foreground select-none flex items-center gap-1.5">
                            <Brain className="h-3 w-3" />
                            Thinking...
                          </summary>
                          <div className="px-3 pb-3 text-xs text-muted-foreground/60 italic leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.thinking}
                            </ReactMarkdown>
                          </div>
                        </details>
                      )}

                      {/* Tool execution indicator */}
                      {msg.toolName && msg.toolStatus === "executing" && (
                        <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-muted-foreground/70">
                          <Wrench className="h-3 w-3 animate-spin" />
                          <span>
                            Running{" "}
                            <span className="font-mono text-foreground/80">
                              {msg.toolName}
                            </span>
                            ...
                          </span>
                        </div>
                      )}

                      {/* Main content with markdown */}
                      {msg.role === "assistant" ? (
                        <div className="prose-sm prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:ml-4 [&>ul]:list-disc [&>ol]:mb-2 [&>ol]:ml-4 [&>ol]:list-decimal [&>h1]:text-base [&>h1]:font-bold [&>h1]:mb-2 [&>h2]:text-sm [&>h2]:font-bold [&>h2]:mb-1.5 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-1 [&>blockquote]:border-l-2 [&>blockquote]:border-white/20 [&>blockquote]:pl-3 [&>blockquote]:italic [&>blockquote]:text-muted-foreground">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Streaming indicator (when content hasn't started yet) */}
                {streaming &&
                  messages[messages.length - 1]?.role === "assistant" &&
                  !messages[messages.length - 1]?.content &&
                  !messages[messages.length - 1]?.thinking && (
                    <div className="flex gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-white/15 text-[10px] text-foreground">
                          AI
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-1 rounded-xl bg-muted px-3 py-2">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
              </div>
            </ScrollArea>

            {/* ---- Input ---- */}
            <div className="border-t border-border/50 p-3">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask anything..."
                  className="min-h-[40px] max-h-[100px] resize-none border bg-card text-sm"
                  rows={1}
                />
                {streaming ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleStop}
                    className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="shrink-0 bg-white text-black hover:bg-white/90"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
