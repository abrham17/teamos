"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { Bot, User, Pencil, X, Check, Copy, RotateCcw, ArrowDown, Loader2, BrainCircuit, Search, BookOpen, Target, ArrowUp, Mic, MicOff, Sparkles, ChevronDown } from "lucide-react";
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

const QUICK_PROMPTS = [
  { label: "Build a Strategic Roadmap", desc: "Generate a timeline with sprint cycles, critical path, and checkpoints.", icon: Target, prompt: "Draft a comprehensive project roadmap for our software launch, complete with 4 milestones and key subtasks." },
  { label: "Decompose Strategic Constraints", desc: "Identify and resolve resource locks, conflicts, and dependency paths.", icon: BrainCircuit, prompt: "Analyze our current project plans, list potential constraints, and provide detailed mitigation ideas." },
  { label: "Draft a System Brief", desc: "Formulate architectural descriptions, component specs, and API lists.", icon: BookOpen, prompt: "Write an architectural system brief for a microservices-based notification engine." },
  { label: "Analyze Project Workload", desc: "Evaluate team distribution, assignee logs, and balance limits.", icon: User, prompt: "Provide a workload analysis overview for the engineering team and flag any over-allocated members." }
];


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

  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recognition, setRecognition] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
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
        rec.onend = () => {
          setIsRecording(false);
        };
        setRecognition(rec);
      }
    }
  }, []);

  const toggleRecording = () => {
    if (!recognition) {
      if (!isRecording) {
        setIsRecording(true);
        const t = "Create a project plan to resolve our workload bottlenecks and assign milestones.";
        let current = "";
        let i = 0;
        const interval = setInterval(() => {
          if (i < t.length) {
            current += t[i];
            setInput(current);
            i++;
          } else {
            clearInterval(interval);
            setIsRecording(false);
          }
        }, 45);
      } else {
        setIsRecording(false);
      }
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      recognition.start();
      setIsRecording(true);
    }
  };

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    setSessionReady(false);

    // Optimistically load from local cache (Phase 6.3)
    const cacheKey = `teamos:chat:sessions:${currentTeamId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId((prev) =>
            prev && parsed.some((s: { id: string }) => s.id === prev) ? prev : parsed[0].id
          );
          setSessionReady(true);
        }
      }
    } catch (e) {
      console.warn("Failed to load cached sessions from localStorage", e);
    }

    (async () => {
      try {
        const data = await api.get<ChatSession[]>(`/chat/${currentTeamId}/sessions/`);
        if (cancelled) return;
        setSessions(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) {
          console.error(e);
        }
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
          const finalSessions = [created];
          setSessions(finalSessions);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(finalSessions));
          } catch (e) {
            console.error(e);
          }
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
        abortControllerRef.current = new AbortController();
        const res = await fetch(
          `${API_BASE}/chat/${currentTeamId}/sessions/${activeSessionId}/query/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            credentials: "include",
            body: JSON.stringify({ message: trimmed }),
            signal: abortControllerRef.current.signal,
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
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          setIsStreaming(false);
          setStatus("Cancelled.");
          return;
        }
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
      setSessions((prev) => {
        const next = [data, ...prev];
        try {
          localStorage.setItem(`teamos:chat:sessions:${currentTeamId}`, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
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
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        try {
          localStorage.setItem(`teamos:chat:sessions:${currentTeamId}`, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
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
      setSessions((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, title } : s));
        try {
          localStorage.setItem(`teamos:chat:sessions:${currentTeamId}`, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
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

  const inputTypingDisabled = isStreaming || !sessionReady || !currentTeamId;
  const sendDisabled = (!isStreaming && !input.trim()) || !sessionReady || !activeSessionId || !currentTeamId;

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full w-full flex-1 bg-[var(--bg-950)] overflow-hidden border-none shadow-none">
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden w-full h-full border-none shadow-none">
        {!currentTeamId ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center space-y-4 my-auto">
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent)]/20 border border-[var(--accent)]/20 flex items-center justify-center">
              <Bot className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Select a Team</h3>
              <p className="text-sm text-[var(--text-muted)]">Select a workspace team from the sidebar dropdown, or create a new team to begin chatting with TeamOS AI.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
            
            {/* ── Messages scroll area ─────────────────────────── */}
            <div 
              ref={scrollContainerRef} 
              className={cn(
                "flex-1 overflow-y-auto px-4 sm:px-6 py-8 min-h-0 custom-scrollbar w-full border-none shadow-none", 
                !hasMessages && "hidden"
              )}
            >
              {hasMessages && messages.map((m, i) => {
                const isLiveAssistant = m.role === "assistant" && isStreaming && i === messages.length - 1;
                const isUser = m.role === "user";
                const isEditing = editingMessageId === m.id;
                
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    key={m.id || i} 
                    className={cn(
                      "mx-auto flex w-full max-w-5xl gap-4 py-4 group/msg border-none shadow-none", 
                      isUser ? "justify-end" : "justify-start"
                    )}
                  >
                    {!isUser && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] mt-0.5 border border-white/5">
                        <Bot className="h-4.5 w-4.5 text-white" />
                      </div>
                    )}
                    <div className={cn("flex max-w-[85%] flex-col gap-2 min-w-0", isUser ? "items-end" : "items-start")}>
                      {!isUser && i === messages.length - 1 && isStreaming && (agentThoughts.length > 0 || agentReflections.length > 0) && (
                        <AgentThinkingPane
                          thoughts={agentThoughts}
                          reflections={agentReflections}
                          steps={agentSteps}
                          isActive={isStreaming}
                        />
                      )}
                      {!isUser && agentStepsForMessage(m).length > 0 && <ChatAgentToolTimeline steps={agentStepsForMessage(m)} />}
                      <div className="relative group/msg-content w-full">
                        <div className={cn(
                          "px-4 py-3 text-[14px] leading-relaxed",
                          isUser
                            ? "rounded-2xl rounded-br-sm bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white"
                            : "text-[var(--text-primary)]"
                        )}>
                            {isEditing ? (
                              <div className="flex flex-col gap-3 min-w-0 w-full">
                                <textarea 
                                  className="w-full bg-transparent border-none outline-none text-white resize-none overflow-hidden" 
                                  value={editInput} 
                                  onChange={(e) => { setEditInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} 
                                  autoFocus 
                                  title="Edit message content"
                                  placeholder="Edit message..."
                                  aria-label="Edit message content"
                                />
                                <div className="flex justify-end gap-2">
                                    <button 
                                      onClick={() => setEditingMessageId(null)} 
                                      title="Cancel"
                                      aria-label="Cancel"
                                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors border border-white/5"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => handleSaveEdit(m.id)} 
                                      title="Save"
                                      aria-label="Save"
                                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors border border-white/5"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                              </div>
                            ) : m.role === "assistant" ? (
                              <div className="w-full max-w-none overflow-x-auto">
                                <ChatMessageContent content={m.content} streaming={isLiveAssistant} />
                              </div>
                            ) : (
                              <span className="whitespace-pre-wrap break-words">{m.content}</span>
                            )}
                        </div>
                        {isUser && !isEditing && (
                            <button 
                              onClick={() => { setEditingMessageId(m.id); setEditInput(m.content); }} 
                              className="absolute -left-9 top-2 p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] opacity-0 group-hover/msg:opacity-100 transition-all border border-transparent hover:border-white/5" 
                              title="Edit"
                              aria-label="Edit Message"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {!isUser && !isLiveAssistant && (
                            <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover/msg-content:opacity-100 transition-all">
                                <button 
                                  onClick={() => { navigator.clipboard.writeText(m.content); }} 
                                  className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-colors border border-transparent hover:border-white/5" 
                                  title="Copy"
                                  aria-label="Copy Message"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                </button>
                                {i === messages.length - 1 && (
                                    <button
                                        onClick={() => {
                                            const lastUser = [...messages].reverse().find(msg => msg.role === "user");
                                            if (lastUser) handleSaveEdit(lastUser.id);
                                        }}
                                        className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-colors border border-transparent hover:border-white/5"
                                        title="Regenerate"
                                        aria-label="Regenerate Message"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                      </div>
                      {m.citations && m.citations.length > 0 && <div className="mt-1 w-full"><ChatCitationList citations={m.citations} /></div>}
                    </div>
                    {isUser && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-700)] border border-[var(--border-strong)] mt-0.5">
                        <User className="h-4.5 w-4.5 text-[var(--text-muted)]" />
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {isStreaming && status && (
                <div className="mx-auto flex w-full max-w-5xl justify-start items-center gap-3 pl-13 border-none shadow-none">
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-800)]">
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
                className="absolute right-6 bottom-24 z-30 p-2.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-all shadow-none"
                title="Scroll to bottom"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            )}

            {/* ── Empty Landing & Bottom Input Container ─────────────────────── */}
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 240, damping: 28 }}
              className={cn(
                "w-full transition-all duration-300 border-none shadow-none flex flex-col items-center",
                hasMessages 
                  ? "shrink-0 bg-[var(--bg-950)] px-4 pt-3 pb-5 border-t border-white/5" 
                  : "flex-1 justify-center p-6 max-w-4xl mx-auto custom-scrollbar overflow-y-auto"
              )}
            >
              {/* Centered Landing elements (Only visible when empty) */}
              {!hasMessages && sessionReady && (
                <motion.div 
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full flex flex-col items-center text-center space-y-6 mb-8"
                >
                  {/* Hero */}
                  <div className="space-y-2 pointer-events-auto">
                    <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] flex items-center justify-center gap-2.5">
                      <Bot className="h-8 w-8 text-[var(--accent)]" />
                      Architect Intelligence
                    </h2>
                    <p className="text-[14px] leading-relaxed text-[var(--text-muted)] max-w-md mx-auto">Design roads, balance assignee logs, search project constraints, and query wiki documents.</p>
                  </div>
                </motion.div>
              )}

              {/* Textarea Input Card */}
              <div className="w-full max-w-3xl relative">
                {strategy && hasMessages && (
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
                    className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] py-4 pl-5 pr-28 text-[14px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/5 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden leading-relaxed backdrop-blur-md shadow-none"
                    style={{ maxHeight: "180px" }}
                    placeholder={!sessionReady ? "Initializing…" : isRecording ? "" : "Ask anything…"}
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
                    title="Chat input prompt"
                  />

                  {/* Glowing Soundwave Overlay when recording */}
                  {isRecording && (
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                      <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                      <span className="text-xs text-rose-500 font-semibold tracking-wider uppercase animate-pulse">Listening...</span>
                      <div className="flex items-end gap-0.5 h-4 ml-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className="w-0.5 bg-rose-500 rounded-full animate-bounce"
                            style={{
                              height: "100%",
                              animationDuration: `${0.4 + n * 0.1}s`,
                              animationDelay: `${n * 0.05}s`
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1">
                    {/* Voice Mic Input */}
                    <button
                      type="button"
                      onClick={toggleRecording}
                      disabled={inputTypingDisabled}
                      title={isRecording ? "Stop recording speech" : "Start recording speech"}
                      aria-label={isRecording ? "Stop recording speech" : "Start recording speech"}
                      className={cn(
                        "h-10 w-10 flex items-center justify-center rounded-full transition-all border border-transparent hover:border-white/5",
                        isRecording 
                          ? "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20" 
                          : "text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-white/5"
                      )}
                    >
                      {isRecording ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
                    </button>

                    {/* Circular send button */}
                    <button
                      onClick={() => {
                        if (isStreaming) {
                          abortControllerRef.current?.abort();
                        } else {
                          void handleSend();
                        }
                      }}
                      disabled={sendDisabled}
                      title={isStreaming ? "Stop generation" : "Send message"}
                      aria-label={isStreaming ? "Stop generation" : "Send message"}
                      className="h-10 w-10 flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white transition-all disabled:opacity-25 hover:scale-105 active:scale-95 shadow-none"
                    >
                      {isStreaming ? <X className="h-4.5 w-4.5" /> : <ArrowUp className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>
                {!hasMessages && (
                  <p className="text-center text-[11px] text-[var(--text-dim)] mt-2">Press Enter to send · Shift+Enter for newline</p>
                )}
              </div>

              {/* Quick Prompt Cards under Input (Only visible when empty) */}
              {!hasMessages && sessionReady && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-3xl mt-8"
                >
                  {QUICK_PROMPTS.map(({ icon: Icon, label, desc, prompt }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                      className="group flex flex-col gap-2.5 p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-[var(--accent)]/20 text-left transition-all duration-200 shadow-none relative overflow-hidden"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                        <Icon className="w-4.5 h-4.5 text-[var(--accent)]" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
                        <div className="text-[11px] text-[var(--text-dim)] mt-0.5 leading-snug">{desc}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </motion.div>

          </div>
        )}
      </div>
    </div>
  );
}
