"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { Send, Bot, User, Pencil, X, Check, Copy, RotateCcw, ArrowDown, Loader2, BrainCircuit, Search, BookOpen, Target } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { ChatCitationList } from "@/components/chat/ChatCitationList";
import { ChatAgentToolTimeline } from "@/components/chat/ChatAgentToolTimeline";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { ChatSession, Citation, ChatMessage, AgentToolStep, AgentThinking, AgentReflection, AgentStep, AgentStrategy } from "@/components/chat/chatTypes";
import { AgentThinkingPane } from "@/components/chat/AgentThinkingPane";

type SessionDetailResponse = { messages?: ChatMessage[] };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

function agentStepsForMessage(m: ChatMessage): AgentToolStep[] {
  if (m.toolSteps?.length) return m.toolSteps;
  const tr = m.metadata?.tool_trace;
  if (!Array.isArray(tr)) return [];
  return tr.map((row: unknown) => {
    const r = row as { name?: string; arguments?: string; result?: { ok?: boolean } };
    return {
      name: r.name ?? "",
      arguments: r.arguments,
      ok: r.result?.ok,
      result: r.result,
    };
  });
}

export function ChatInterface() {
  const { currentTeamId } = useWikiStore();
  const { error: toastError } = useToast();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [strategy, setStrategy] = useState<AgentStrategy | null>(null);
  const [agentThoughts, setAgentThoughts] = useState<AgentThinking[]>([]);
  const [agentReflections, setAgentReflections] = useState<AgentReflection[]>([]);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    setSessionReady(false);
    (async () => {
      try {
        const data = await api.get<ChatSession[]>(`/chat/${currentTeamId}/sessions/`);
        if (cancelled) return;
        setSessions(data);
        if (data.length > 0) {
          setActiveSessionId((prev) =>
            prev && data.some((s) => s.id === prev) ? prev : data[0].id,
          );
        } else {
          let created: ChatSession | null = null;
          let lastErr: unknown = null;
          for (let attempt = 0; attempt < 2 && !created; attempt++) {
            try {
              created = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, {
                title: "New Chat",
              });
            } catch (e) {
              lastErr = e;
              console.error(e);
            }
          }
          if (cancelled) return;
          if (!created) {
            throw lastErr instanceof Error ? lastErr : new Error("Could not create chat session");
          }
          setSessions([created]);
          setActiveSessionId(created.id);
        }
      } catch (e) {
        console.error(e);
        toastError("Could not start chat.");
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [currentTeamId, toastError]);



  useEffect(() => {
    if (!currentTeamId || !activeSessionId) return;
    api
      .get<SessionDetailResponse>(`/chat/${currentTeamId}/sessions/${activeSessionId}/`)
      .then((data) => {
        setMessages(data.messages || []);
      })
      .catch(console.error);
  }, [currentTeamId, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 120);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendUserMessage = useCallback(
    async (userMsg: string) => {
      const trimmed = userMsg.trim();
      if (!trimmed || !currentTeamId || !activeSessionId || isStreaming) return;

      setIsStreaming(true);
      setStatus("Analyzing mission...");
      setAgentThoughts([]);
      setAgentReflections([]);
      setAgentSteps([]);
      setStrategy(null);
      
      const userMsgObj: ChatMessage = { role: "user", content: trimmed, id: `u-${Date.now()}` };
      setMessages((prev) => [...prev, userMsgObj]);

      const auth = await getApiAuthHeaders();
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: "",
        citations: [],
        id: assistantId,
        toolSteps: [],
        agentSteps: [],
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch(
          `${API_BASE}/chat/${currentTeamId}/sessions/${activeSessionId}/query/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            credentials: "include",
            body: JSON.stringify({ message: trimmed }),
          },
        );

        if (!res.ok) throw new Error("Stream error");
        if (!res.body) throw new Error("No body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let working = { ...assistantMsg };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              const dataStr = line.replace("data:", "").trim();
              if (!dataStr) continue;

              try {
                const data = JSON.parse(dataStr) as Record<string, unknown>;
                if (currentEvent === "status") {
                  setStatus(String(data.status ?? ""));
                } else if (currentEvent === "agent_strategy") {
                  const strat = data as unknown as AgentStrategy;
                  setStrategy(strat);
                } else if (currentEvent === "chunk") {
                  setStatus("");
                  const token = String((data as { token?: string }).token ?? "");
                  working = { ...working, content: working.content + token };
                  setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = { ...working };
                    return next;
                  });
                } else if (currentEvent === "citations") {
                  const cits = (data as { citations?: Citation[] }).citations ?? [];
                  working = { ...working, citations: cits };
                  setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = { ...working };
                    return next;
                  });
                } else if (currentEvent === "tool_call") {
                  const name = String((data as { name?: string }).name ?? "");
                  const arg = String((data as { arguments?: string }).arguments ?? "");
                  const steps = [...(working.toolSteps ?? []), { name, arguments: arg }];
                  working = { ...working, toolSteps: steps };
                  setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = { ...working };
                    return next;
                  });
                } else if (currentEvent === "tool_result") {
                  const name = String((data as { name?: string }).name ?? "");
                  const ok = Boolean((data as { ok?: boolean }).ok);
                  const result = (data as { result?: unknown }).result;
                  const steps = [...(working.toolSteps ?? [])];
                  let li = -1;
                  for (let i = steps.length - 1; i >= 0; i--) {
                    if (steps[i].name === name && steps[i].ok === undefined) { li = i; break; }
                  }
                  if (li >= 0) steps[li] = { ...steps[li], ok, result };
                  working = { ...working, toolSteps: steps };
                  setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = { ...working };
                    return next;
                  });
                } else if (currentEvent === "agent_step") {
                  const name = String((data as { name?: string }).name ?? "");
                  const arg = String((data as { arguments?: string }).arguments ?? "");
                  const steps = [...(working.agentSteps ?? []), { name, arguments: arg }];
                  working = { ...working, agentSteps: steps };
                  setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = { ...working };
                    return next;
                  });
                } else if (currentEvent === "agent_result") {
                  const name = String((data as { name?: string }).name ?? "");
                  const ok = Boolean((data as { ok?: boolean }).ok);
                  const result = (data as { result?: unknown }).result;
                  const steps = [...(working.agentSteps ?? [])];
                  let li = -1;
                  for (let i = steps.length - 1; i >= 0; i--) {
                    if (steps[i].name === name && steps[i].ok === undefined) { li = i; break; }
                  }
                  if (li >= 0) steps[li] = { ...steps[li], ok, result };
                  working = { ...working, agentSteps: steps };
                  setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = { ...working };
                    return next;
                  });
                } else if (currentEvent === "thinking") {
                  const content = String((data as { content?: string }).content ?? "");
                  if (content) {
                    setAgentThoughts((prev) => [...prev, { content, timestamp: Date.now() }]);
                  }
                } else if (currentEvent === "reflection") {
                  const reflection = data as unknown as AgentReflection;
                  if (reflection && !reflection.success) {
                    setAgentReflections((prev) => [...prev, reflection]);
                  }
                } else if (currentEvent === "replan") {
                  setStatus("Replanning approach...");
                } else if (currentEvent === "done") {
                  setIsStreaming(false);
                  setStatus("");
                } else if (currentEvent === "error") {
                  throw new Error("Stream error");
                }
              } catch { /* skip parse errs */ }
            }
          }
        }
      } catch (e) {
        console.error(e);
        setIsStreaming(false);
        setStatus("Error fetching response.");
        toastError("Failed to connect to AI server.");
      }
    },
    [activeSessionId, currentTeamId, isStreaming, toastError],
  );

  const handleNewChat = async () => {
    if (!currentTeamId) return;
    try {
      const data = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, { title: "New Chat" });
      setSessions((prev) => [data, ...prev]);
      setActiveSessionId(data.id);
      setMessages([]);
    } catch (e) {
      console.error(e);
      toastError("Could not create a new chat.");
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!currentTeamId) return;
    try {
      await api.delete(`/chat/${currentTeamId}/sessions/${id}/`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
        setMessages([]);
      }
    } catch (e) {
      console.error(e);
      toastError("Could not delete chat.");
    }
  };

  const handleRenameSession = async (id: string, title: string) => {
    if (!currentTeamId) return;
    try {
      await api.patch(`/chat/${currentTeamId}/sessions/${id}/`, { title });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    } catch (e) {
      console.error(e);
      toastError("Could not rename chat.");
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    if (!activeSessionId) {
      toastError("Chat session is not ready.");
      return;
    }
    if (!overrideText) {
      setInput("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    }
    await sendUserMessage(text);
  };

  const handleSaveEdit = async (id: string) => {
    const msg = messages.find(m => m.id === id);
    if (!msg || !editInput.trim()) return;
    const idx = messages.findIndex(m => m.id === id);
    setMessages(prev => prev.slice(0, idx));
    setEditingMessageId(null);
    await handleSend(editInput);
  };

  if (!currentTeamId) return <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">Select a team first</div>;

  const inputTypingDisabled = isStreaming || !sessionReady;
  const sendDisabled = isStreaming || !sessionReady || !activeSessionId || !input.trim();

  return (
    <div className="flex h-full w-full flex-1 bg-[var(--bg-950)] overflow-hidden">
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden w-full h-full">
        <div ref={scrollContainerRef} className="flex flex-1 flex-col gap-0 overflow-y-auto px-4 sm:px-6 py-8 min-h-0 custom-scrollbar w-full">
          {!sessionReady && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 my-auto">
              <Loader2 className="h-6 w-6 text-[var(--text-dim)] animate-spin" />
              <p className="text-[13px] text-[var(--text-dim)]">Initializing…</p>
            </div>
          )}
          {sessionReady && messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center px-4 my-auto gap-10">
              {/* Hero */}
              <div className="text-center space-y-4">
                <div className="relative mx-auto w-14 h-14">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] opacity-20 blur-xl" />
                  <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center shadow-[var(--shadow-glow)]">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Team Intelligence</h2>
                  <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--text-muted)]">Ask anything about your wiki, plans, and team knowledge.</p>
                </div>
              </div>
              {/* Capability cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
                {[
                  { icon: Search,   label: "Search knowledge",    desc: "Ask anything about your wiki",               prompt: "Summarize our key knowledge areas" },
                  { icon: BookOpen, label: "Create wiki pages",   desc: "Draft or update knowledge base pages",        prompt: "Create a wiki page about our onboarding process" },
                  { icon: Target,   label: "Build & manage plans",desc: "Generate tasks, milestones, and timelines",   prompt: "Show me the current project plans and highlight risks" },
                ].map(({ icon: Icon, label, desc, prompt }) => (
                  <button
                    key={label}
                    onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                    className="group flex flex-col gap-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-800)] hover:bg-[var(--bg-700)] hover:border-[var(--border-strong)] text-left transition-all duration-150 shadow-[var(--shadow-sm)]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                      <Icon className="w-4 h-4 text-[var(--accent)]" />
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
                      <div className="text-[12px] text-[var(--text-muted)] mt-1 leading-snug">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isLiveAssistant = m.role === "assistant" && isStreaming && i === messages.length - 1;
            const isUser = m.role === "user";
            const isEditing = editingMessageId === m.id;
            
            return (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={m.id || i} className={cn("mx-auto flex w-full max-w-3xl gap-3 py-2.5 group/msg", isUser ? "justify-end" : "justify-start")}>
                {!isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] shadow-[var(--shadow-glow)] mt-0.5">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className={cn("flex max-w-[80%] flex-col gap-2", isUser ? "items-end" : "items-start")}>
                  {!isUser && i === messages.length - 1 && isStreaming && (agentThoughts.length > 0 || agentReflections.length > 0) && (
                    <AgentThinkingPane
                      thoughts={agentThoughts}
                      reflections={agentReflections}
                      steps={agentSteps}
                      isActive={isStreaming}
                    />
                  )}
                  {!isUser && agentStepsForMessage(m).length > 0 && <ChatAgentToolTimeline steps={agentStepsForMessage(m)} />}
                  <div className="relative group/msg-content">
                    <div className={cn(
                      "px-4 py-3 text-[14px] leading-relaxed",
                      isUser
                        ? "rounded-2xl rounded-br-sm bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white shadow-[var(--shadow-md)]"
                        : "text-[var(--text-primary)]"
                    )}>
                        {isEditing ? (
                          <div className="flex flex-col gap-3 min-w-0 w-full">
                            <textarea className="w-full bg-transparent border-none outline-none text-white resize-none overflow-hidden" value={editInput} onChange={(e) => { setEditInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} autoFocus />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingMessageId(null)} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"><X className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleSaveEdit(m.id)} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ) : m.role === "assistant" ? (
                          <ChatMessageContent content={m.content} streaming={isLiveAssistant} />
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{m.content}</span>
                        )}
                    </div>
                    {isUser && !isEditing && (
                        <button onClick={() => { setEditingMessageId(m.id); setEditInput(m.content); }} className="absolute -left-9 top-2 p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] opacity-0 group-hover/msg:opacity-100 transition-all" title="Edit">
                            <Pencil className="w-3 h-3" />
                        </button>
                    )}
                    {!isUser && !isLiveAssistant && (
                        <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover/msg-content:opacity-100 transition-all">
                            <button onClick={() => { navigator.clipboard.writeText(m.content); }} className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-colors" title="Copy">
                                <Copy className="w-3 h-3" />
                            </button>
                            {i === messages.length - 1 && (
                                <button
                                    onClick={() => {
                                        const lastUser = [...messages].reverse().find(msg => msg.role === "user");
                                        if (lastUser) handleSaveEdit(lastUser.id);
                                    }}
                                    className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-colors"
                                    title="Regenerate"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}
                  </div>
                  {m.citations && m.citations.length > 0 && <div className="mt-1"><ChatCitationList citations={m.citations} /></div>}
                </div>
                {isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-700)] border border-[var(--border-strong)] mt-0.5">
                    <User className="h-4 w-4 text-[var(--text-muted)]" />
                  </div>
                )}
              </motion.div>
            );
          })}

          {isStreaming && status && (
            <div className="mx-auto flex w-full max-w-3xl justify-start items-center gap-3 pl-11">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-800)] shadow-[var(--shadow-sm)]">
                <Loader2 className="w-3 h-3 text-[var(--accent)] animate-spin shrink-0" />
                <span className="text-[12px] text-[var(--text-muted)]">{status}</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute right-6 bottom-24 z-30 p-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] shadow-[var(--shadow-md)] transition-all"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Input bar */}
        <div className="shrink-0 bg-[var(--bg-950)] px-4 pt-3 pb-5 w-full">
          <div className="mx-auto w-full max-w-3xl">
            {strategy && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 mb-2 px-1"
              >
                {strategy.primary_agent === "lightweight" && <Search className="w-3 h-3 text-[var(--accent)]" />}
                {(strategy.primary_agent === "wiki" || strategy.primary_agent === "plan" || strategy.primary_agent === "analyst" || strategy.primary_agent === "strategic_planner") && <BrainCircuit className="w-3 h-3 text-[var(--accent)]" />}
                <span className="text-[11px] text-[var(--text-muted)]">
                  {strategy.primary_agent === "strategic_planner" ? "Architecting strategy" :
                   strategy.primary_agent === "lightweight" ? "Knowledge lookup" : "Executing"}
                </span>
                <span className="text-[var(--text-dim)] text-[11px]">· {strategy.reasoning_depth}</span>
              </motion.div>
            )}
            <div className="relative w-full">
              <textarea
                ref={inputRef}
                rows={1}
                className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-800)] py-3.5 pl-4 pr-14 text-[14px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden leading-relaxed shadow-[var(--shadow-md)]"
                style={{ maxHeight: "180px" }}
                placeholder={!sessionReady ? "Initializing…" : "Ask anything… (Shift+Enter for newline)"}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={inputTypingDisabled}
              />
              <button
                onClick={() => void handleSend()}
                disabled={sendDisabled}
                className="absolute right-2.5 bottom-2.5 h-9 w-9 flex items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white transition-all disabled:opacity-30 hover:shadow-[var(--shadow-glow)] active:scale-95"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
