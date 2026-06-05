"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import {
  ArrowUp,
  Mic,
  MicOff,
  RotateCcw,
  Copy,
  ChevronDown,
  Paperclip,
  Globe2,
  Search,
  BrainCircuit,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Wrench,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { ChatCitationList } from "@/components/chat/ChatCitationList";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { QuestionCard } from "@/components/chat/QuestionCard";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type {
  ChatSession,
  Citation,
  ChatMessage,
  AgentToolStep,
  ChatCapabilities,
  CrewProgress,
  GuardianBlock,
} from "@/components/chat/chatTypes";
import { GuardianBlockCard } from "@/components/chat/GuardianBlockCard";
import { CollapsibleThoughtBlock } from "@/components/chat/CollapsibleThoughtBlock";

type SessionDetailResponse = { messages?: ChatMessage[] };
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export type ChatMode = "ask" | "agent" | "research";

// ── MCP Call Activity ──────────────────────────────────────────────────────

interface MCPCall {
  id: string;
  name: string;
  server: string;
  status: "running" | "done" | "error";
  latency_ms?: number;
  result_preview?: string;
}

function MCPActivityLine({ call }: { call: MCPCall }) {
  const toolLabel = call.name
    .replace(/^mcp_[^_]+_/, "")
    .replace(/_/g, " ");

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 py-0.5"
    >
      <span className="shrink-0">
        {call.status === "running" ? (
          <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />
        ) : call.status === "error" ? (
          <AlertCircle className="w-3 h-3 text-[var(--danger)]" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
        )}
      </span>
      <span className="text-[11px] text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-secondary)] capitalize">{toolLabel}</span>
        {call.server && (
          <span className="ml-1 text-[var(--text-dim)] font-mono">via {call.server}</span>
        )}
      </span>
      {call.latency_ms && call.status === "done" && (
        <span className="ml-auto text-[10px] text-[var(--text-dim)] font-mono shrink-0">
          {call.latency_ms}ms
        </span>
      )}
    </motion.div>
  );
}

// ── Inline Agent Activity (collapsed by default, expandable) ──────────────

interface AgentActivityProps {
  mcpCalls: MCPCall[];
  thinkingContent: string[];
  isRunning: boolean;
}

function AgentActivity({ mcpCalls, thinkingContent, isRunning }: AgentActivityProps) {
  const [expanded, setExpanded] = useState(false);

  if (mcpCalls.length === 0 && thinkingContent.length === 0) return null;

  const completedCount = mcpCalls.filter((c) => c.status !== "running").length;
  const totalCount = mcpCalls.length;
  const label = isRunning
    ? mcpCalls.find((c) => c.status === "running")
        ? `Using ${mcpCalls.find((c) => c.status === "running")!.name.replace(/^mcp_[^_]+_/, "").replace(/_/g, " ")}…`
        : "Thinking…"
    : `Used ${totalCount} tool${totalCount !== 1 ? "s" : ""}`;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors select-none group"
      >
        <Wrench
          className={cn(
            "w-3 h-3 shrink-0 transition-colors",
            isRunning ? "text-[var(--accent)] animate-pulse" : "text-[var(--text-dim)] group-hover:text-[var(--text-muted)]"
          )}
        />
        <span className={isRunning ? "text-[var(--accent)]" : ""}>{label}</span>
        {isRunning && (
          <span className="inline-flex h-1 w-1 rounded-full bg-[var(--accent)] animate-ping" />
        )}
        {!isRunning && (
          <ChevronRight
            className={cn(
              "w-3 h-3 ml-0.5 transition-transform duration-200",
              expanded && "rotate-90"
            )}
          />
        )}
      </button>

      <AnimatePresence>
        {(expanded || isRunning) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 pl-5 border-l border-[var(--border-subtle)] space-y-0.5"
          >
            {thinkingContent.slice(-1).map((t, i) => (
              <p
                key={i}
                className="text-[11px] text-[var(--text-dim)] italic leading-relaxed line-clamp-2"
              >
                {t}
              </p>
            ))}
            {mcpCalls.map((call) => (
              <MCPActivityLine key={call.id} call={call} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Clarification Overlay ──────────────────────────────────────────────────

interface AskingState {
  question: string;
  options?: string[];
  tool_call_id: string;
}

// ── Message Bubble ─────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
  isLast?: boolean;
}

function MessageBubble({ message, onRetry, isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("group flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[85%] md:max-w-[72%]", isUser ? "items-end" : "items-start", "flex flex-col")}>
        {/* Agent activity (before assistant message) */}
        {!isUser && (message.activityFeed?.length || message.metadata?.thinking_content) && (
          <AgentActivity
            mcpCalls={
              (message.activityFeed || [])
                .filter((e) => e.kind === "tool")
                .map((e) => ({
                  id: e.id,
                  name: e.message,
                  server: (e.detail?.server as string) || "",
                  status: e.status === "done" ? "done" : e.status === "error" ? "error" : "running",
                  latency_ms: e.detail?.latency_ms as number | undefined,
                }))
            }
            thinkingContent={
              message.metadata?.thinking_content
                ? [message.metadata.thinking_content as string]
                : []
            }
            isRunning={false}
          />
        )}

        {/* Guardian blocks */}
        {message.guardianBlocks?.map((block) => (
          <GuardianBlockCard key={block.id} block={block} />
        ))}

        {/* Message content */}
        {isUser ? (
          <div className="bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-2xl rounded-br-sm px-4 py-3">
            <p className="text-[14px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        ) : (
          <div className="w-full">
            {message.isStreaming && !message.content ? (
              <div className="flex items-center gap-2 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:300ms]" />
              </div>
            ) : (
              <ChatMessageContent content={message.content} isStreaming={message.isStreaming} />
            )}
          </div>
        )}

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 w-full">
            <ChatCitationList citations={message.citations} />
          </div>
        )}

        {/* Tool steps summary (compact) */}
        {!isUser && message.toolSteps && message.toolSteps.length > 0 && (
          <div className="mt-1.5 w-full">
            <AgentActivity
              mcpCalls={message.toolSteps.map((s, i) => ({
                id: String(i),
                name: s.name,
                server: s.name.split("_")[1] || "",
                status: s.ok === false ? "error" : "done",
              }))}
              thinkingContent={[]}
              isRunning={false}
            />
          </div>
        )}

        {/* Crew progress (compact) */}
        {!isUser && message.crewProgress && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.crewProgress.agents.map((agent) => (
              <span
                key={agent.role}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  agent.status === "done"
                    ? "border-[var(--success)]/30 text-[var(--success)] bg-[var(--success)]/5"
                    : agent.status === "executing" || agent.status === "thinking"
                    ? "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent)]/5"
                    : "border-[var(--border-subtle)] text-[var(--text-dim)]"
                )}
              >
                {agent.role.replace(/_/g, " ")}
                {(agent.status === "executing" || agent.status === "thinking") && (
                  <Loader2 className="inline w-2.5 h-2.5 animate-spin ml-1" />
                )}
              </span>
            ))}
          </div>
        )}

        {/* Message actions */}
        {!isUser && message.content && !message.isStreaming && (
          <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--text-dim)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-800)] transition-all"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Copied" : "Copy"}
            </button>
            {isLast && onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--text-dim)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-800)] transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Input Bar ──────────────────────────────────────────────────────────────

interface InputBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  mode: ChatMode;
  onModeChange: (m: ChatMode) => void;
  capabilities: ChatCapabilities | null;
  isRecording: boolean;
  onToggleRecording: () => void;
  placeholder?: string;
}

const MODE_META: Record<ChatMode, { label: string; icon: typeof Search; hint: string }> = {
  ask: { label: "Ask", icon: Search, hint: "Search knowledge base" },
  agent: { label: "Agent", icon: BrainCircuit, hint: "Autonomous actions" },
  research: { label: "Research", icon: Globe2, hint: "Web research" },
};

function InputBar({
  value,
  onChange,
  onSubmit,
  disabled,
  mode,
  onModeChange,
  capabilities,
  isRecording,
  onToggleRecording,
  placeholder,
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const Icon = MODE_META[mode].icon;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const modes: ChatMode[] = ["ask", "agent", "research"];
  const modeEnabled: Record<ChatMode, boolean> = {
    ask: true,
    agent: !!capabilities?.agent_mode_available,
    research: !!capabilities?.research_mode_available,
  };

  return (
    <div className="w-full">
      {/* Mode selector — minimal pills */}
      <div className="flex items-center gap-1 mb-2 px-1">
        {modes.map((m) => {
          const meta = MODE_META[m];
          const ModeIcon = meta.icon;
          const enabled = modeEnabled[m];
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => enabled && onModeChange(m)}
              disabled={!enabled}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all",
                active
                  ? "bg-[var(--text-primary)] text-[var(--bg-950)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)]",
                !enabled && "opacity-30 cursor-not-allowed"
              )}
            >
              <ModeIcon className="w-3 h-3" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Input box */}
      <div className={cn(
        "relative flex items-end gap-2 rounded-2xl border bg-[var(--bg-900)] px-4 py-3 transition-all",
        disabled ? "border-[var(--border-subtle)] opacity-70" : "border-[var(--border-subtle)] focus-within:border-[var(--accent)]/40 focus-within:bg-[var(--bg-850)]"
      )}>
        <Icon className="w-4 h-4 shrink-0 text-[var(--text-dim)] mb-0.5 mt-1" />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder={
            placeholder ||
            (mode === "ask"
              ? "Ask anything about your team knowledge…"
              : mode === "agent"
              ? "What should the agent do?"
              : "Research a topic on the web…")
          }
          rows={1}
          className="flex-1 resize-none bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-dim)] outline-none leading-relaxed max-h-[200px] overflow-y-auto"
        />

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleRecording}
            className={cn(
              "p-1.5 rounded-xl transition-all",
              isRecording
                ? "text-rose-400 bg-rose-500/10"
                : "text-[var(--text-dim)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-800)]"
            )}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className={cn(
              "p-1.5 rounded-xl transition-all",
              !disabled && value.trim()
                ? "bg-[var(--text-primary)] text-[var(--bg-950)] hover:opacity-90"
                : "text-[var(--text-dim)] bg-[var(--bg-800)] cursor-not-allowed opacity-50"
            )}
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { label: "Search knowledge base", prompt: "Search our wiki and summarize everything about our onboarding process.", icon: Search },
  { label: "Research & analyze", prompt: "Research the top AI workspace tools and compare their key features.", icon: Globe2 },
  { label: "Agent task", prompt: "Summarize all wiki pages updated this week and highlight critical changes.", icon: BrainCircuit },
];

function EmptyChat({ onQuickPrompt }: { onQuickPrompt: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12 gap-8">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          How can I help?
        </h2>
        <p className="text-[13px] text-[var(--text-muted)] max-w-xs leading-relaxed">
          Ask questions, run agentic tasks, or research topics using your team&apos;s knowledge.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-md">
        {QUICK_PROMPTS.map(({ label, prompt, icon: Icon }) => (
          <button
            key={label}
            onClick={() => onQuickPrompt(prompt)}
            className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl border border-[var(--border-subtle)] hover:bg-[var(--bg-800)] hover:border-[var(--accent)]/30 transition-all group"
          >
            <Icon className="w-4 h-4 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
            <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
              {label}
            </span>
            <ChevronRight className="w-3.5 h-3.5 ml-auto text-[var(--text-dim)] group-hover:text-[var(--text-muted)] transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function ChatInterface() {
  const { currentTeamId } = useWikiStore();
  const { error: toastError } = useToast();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [capabilities, setCapabilities] = useState<ChatCapabilities | null>(null);
  const [mode, setMode] = useState<ChatMode>("ask");
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recognition, setRecognition] = useState<any>(null);

  // Streaming state
  const [streamingMcpCalls, setStreamingMcpCalls] = useState<MCPCall[]>([]);
  const [streamingThoughts, setStreamingThoughts] = useState<string[]>([]);
  const [askingState, setAskingState] = useState<AskingState | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // ── Session loading ──────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
      };
      rec.onend = () => setIsRecording(false);
      setRecognition(rec);
    }
  }, []);

  const toggleRecording = () => {
    if (!recognition) return;
    if (isRecording) { recognition.stop(); setIsRecording(false); }
    else { recognition.start(); setIsRecording(true); }
  };

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.get<ChatSession[]>(`/chat/${currentTeamId}/sessions/`);
        if (cancelled) return;
        setSessions(data);
        if (data.length > 0) {
          setActiveSessionId((prev) =>
            prev && data.some((s) => s.id === prev) ? prev : data[0].id
          );
        } else {
          const created = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, { title: "New Chat" });
          if (cancelled) return;
          setSessions([created]);
          setActiveSessionId(created.id);
        }
      } catch (e) {
        console.error(e);
      }
    })();

    // Load capabilities
    api.get<ChatCapabilities>(`/chat/${currentTeamId}/capabilities/`)
      .then(setCapabilities)
      .catch(() => {});

    return () => { cancelled = true; };
  }, [currentTeamId]);

  // Load session messages
  useEffect(() => {
    if (!currentTeamId || !activeSessionId) return;
    api.get<SessionDetailResponse>(`/chat/${currentTeamId}/sessions/${activeSessionId}/`)
      .then((data) => setMessages(data.messages || []))
      .catch(() => setMessages([]));
  }, [currentTeamId, activeSessionId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim();
    if (!text || isStreaming || !currentTeamId || !activeSessionId) return;

    setInput("");
    setStreamingMcpCalls([]);
    setStreamingThoughts([]);
    setAskingState(null);

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantMsg: ChatMessage = {
      id: `asst_${Date.now()}`,
      role: "assistant",
      content: "",
      isStreaming: true,
      activityFeed: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const headers = await getApiAuthHeaders();
      const endpoint = mode === "ask"
        ? `/chat/${currentTeamId}/sessions/${activeSessionId}/ask/`
        : mode === "research"
        ? `/chat/${currentTeamId}/sessions/${activeSessionId}/research/`
        : `/chat/${currentTeamId}/sessions/${activeSessionId}/agent/`;

      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: abortController.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      let buffer = "";
      let contentAccum = "";
      const localMcpCalls: MCPCall[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { event: string; data: Record<string, unknown> };
            const { event, data } = evt;

            if (event === "thinking") {
              setStreamingThoughts((prev) => [...prev, data.content as string]);
            } else if (event === "mcp_call") {
              const call: MCPCall = {
                id: `mcp_${Date.now()}_${Math.random()}`,
                name: data.name as string,
                server: data.server as string,
                status: "running",
              };
              localMcpCalls.push(call);
              setStreamingMcpCalls([...localMcpCalls]);
            } else if (event === "mcp_result") {
              const idx = localMcpCalls.findIndex((c) => c.name === data.name && c.status === "running");
              if (idx !== -1) {
                localMcpCalls[idx] = {
                  ...localMcpCalls[idx],
                  status: data.ok ? "done" : "error",
                  latency_ms: data.latency_ms as number,
                };
                setStreamingMcpCalls([...localMcpCalls]);
              }
            } else if (event === "asking") {
              setAskingState({
                question: data.question as string,
                options: data.options as string[] | undefined,
                tool_call_id: data.tool_call_id as string,
              });
            } else if (event === "chunk") {
              contentAccum += data.token as string;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: contentAccum };
                }
                return updated;
              });
            } else if (event === "done") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    isStreaming: false,
                    toolSteps: (data.mcp_trace as AgentToolStep[]) || [],
                  };
                }
                return updated;
              });
            }
          } catch {/* ignore parse errors */}
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toastError("Something went wrong. Please try again.");
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.isStreaming) {
            updated[updated.length - 1] = { ...last, isStreaming: false, content: last.content || "An error occurred." };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setStreamingMcpCalls([]);
      setStreamingThoughts([]);
      abortControllerRef.current = null;
    }
  }, [input, isStreaming, currentTeamId, activeSessionId, mode, toastError]);

  const handleNewChat = useCallback(async () => {
    if (!currentTeamId) return;
    try {
      const created = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, { title: "New Chat" });
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setMessages([]);
    } catch {}
  }, [currentTeamId]);

  const handleDeleteSession = useCallback(async (id: string) => {
    if (!currentTeamId) return;
    try {
      await api.delete(`/chat/${currentTeamId}/sessions/${id}/`);
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        if (activeSessionId === id) {
          setActiveSessionId(filtered[0]?.id ?? null);
          setMessages([]);
        }
        return filtered;
      });
    } catch {}
  }, [currentTeamId, activeSessionId]);

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    if (!currentTeamId) return;
    try {
      await api.patch(`/chat/${currentTeamId}/sessions/${id}/`, { title });
      setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
    } catch {}
  }, [currentTeamId]);

  const handleAnswerClarification = useCallback((answer: string) => {
    setAskingState(null);
    handleSend(answer);
  }, [handleSend]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!currentTeamId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
        Select a team to start chatting
      </div>
    );
  }

  const showEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Messages */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 md:px-6"
        >
          {showEmpty ? (
            <EmptyChat onQuickPrompt={(p) => { setInput(p); }} />
          ) : (
            <div className="max-w-2xl mx-auto py-8 space-y-6">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isLast={i === messages.length - 1}
                  onRetry={
                    i === messages.length - 1 && msg.role === "assistant"
                      ? () => {
                          const lastUser = [...messages].reverse().find((m) => m.role === "user");
                          if (lastUser) handleSend(lastUser.content);
                        }
                      : undefined
                  }
                />
              ))}

              {/* Live streaming indicator */}
              {isStreaming && (streamingMcpCalls.length > 0 || streamingThoughts.length > 0) && (
                <div className="ml-0">
                  <AgentActivity
                    mcpCalls={streamingMcpCalls}
                    thinkingContent={streamingThoughts}
                    isRunning={true}
                  />
                </div>
              )}

              {/* Clarification card */}
              <AnimatePresence>
                {askingState && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="max-w-md"
                  >
                    <QuestionCard
                      question={askingState.question}
                      options={askingState.options}
                      onSelect={handleAnswerClarification}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Scroll to bottom */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="absolute bottom-24 right-6 p-2 rounded-full bg-[var(--bg-800)] border border-[var(--border-subtle)] shadow-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-950)] px-4 md:px-6 py-4">
          <div className="max-w-2xl mx-auto">
            <InputBar
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              disabled={isStreaming}
              mode={mode}
              onModeChange={setMode}
              capabilities={capabilities}
              isRecording={isRecording}
              onToggleRecording={toggleRecording}
            />
            <p className="text-center text-[10px] text-[var(--text-dim)] mt-2">
              All tools run via MCP · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
