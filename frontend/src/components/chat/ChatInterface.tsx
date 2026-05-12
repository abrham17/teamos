"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { Send, Bot, User, Pencil, X, Check, Copy, RotateCcw, ArrowDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { ChatCitationList } from "@/components/chat/ChatCitationList";
import { ChatModeSegmentedControl, type ChatMode } from "@/components/chat/ChatModeSegmentedControl";
import { ChatAgentToolTimeline } from "@/components/chat/ChatAgentToolTimeline";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { ChatSession, Citation, ChatMessage, ChatCapabilities, AgentToolStep, AgentThinking, AgentReflection } from "@/components/chat/chatTypes";
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

  const [chatMode, setChatMode] = useState<ChatMode>("ask");
  const [chatCaps, setChatCaps] = useState<ChatCapabilities | null>(null);

  const [agentThoughts, setAgentThoughts] = useState<AgentThinking[]>([]);
  const [agentReflections, setAgentReflections] = useState<AgentReflection[]>([]);
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
    if (!currentTeamId) return;
    try {
      const v = sessionStorage.getItem(`teamos-chat-mode-${currentTeamId}`);
      if (v === "agent" || v === "ask" || v === "plan") setChatMode(v as ChatMode);
    } catch { /* ignore */ }
  }, [currentTeamId]);

  useEffect(() => {
    if (!currentTeamId) return;
    try {
      sessionStorage.setItem(`teamos-chat-mode-${currentTeamId}`, chatMode);
    } catch { /* ignore */ }
  }, [currentTeamId, chatMode]);

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    api
      .get<ChatCapabilities>(`/chat/${currentTeamId}/capabilities/`)
      .then((data) => {
        if (!cancelled && data) setChatCaps(data);
      })
      .catch(() => {
        if (!cancelled) setChatCaps(null);
      });
    return () => { cancelled = true; };
  }, [currentTeamId]);

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
    async (userMsg: string, options?: { mode?: ChatMode }) => {
      const trimmed = userMsg.trim();
      if (!trimmed || !currentTeamId || !activeSessionId || isStreaming) return;

      const mode = options?.mode ?? chatMode;

      setIsStreaming(true);
      setStatus("Connecting...");
      setAgentThoughts([]);
      setAgentReflections([]);
      
      const userMsgObj: ChatMessage = { role: "user", content: trimmed, id: `u-${Date.now()}`, metadata: { mode } };
      setMessages((prev) => [...prev, userMsgObj]);

      const auth = await getApiAuthHeaders();
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: "",
        citations: [],
        id: assistantId,
        toolSteps: mode === "agent" || mode === "plan" ? [] : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch(
          `${API_BASE}/chat/${currentTeamId}/sessions/${activeSessionId}/query/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            credentials: "include",
            body: JSON.stringify({ message: trimmed, mode }),
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
    [activeSessionId, chatMode, currentTeamId, isStreaming, toastError],
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

  const handleSend = async (overrideText?: string, options?: { mode?: ChatMode }) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    if (!activeSessionId) {
      toastError("Chat session is not ready.");
      return;
    }
    if (!overrideText) setInput("");
    await sendUserMessage(text, options);
  };

  const handleSaveEdit = async (id: string) => {
    const msg = messages.find(m => m.id === id);
    if (!msg || !editInput.trim()) return;
    const idx = messages.findIndex(m => m.id === id);
    const mode = (msg.metadata?.mode as ChatMode) || chatMode;
    setMessages(prev => prev.slice(0, idx));
    setEditingMessageId(null);
    await handleSend(editInput, { mode });
  };

  if (!currentTeamId) return <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">Select a team first</div>;

  const inputTypingDisabled = isStreaming || !sessionReady;
  const sendDisabled = isStreaming || !sessionReady || !activeSessionId || !input.trim();

  return (
    <div className="flex h-full w-full flex-1 bg-[var(--bg-950)] relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[5%] w-[40%] h-[40%] bg-[radial-gradient(circle,rgba(var(--accent-rgb),0.08)_0%,transparent_70%)] blur-[100px] pointer-events-none" />


      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      <div className="flex min-w-0 flex-1 flex-col relative z-10 overflow-hidden w-full h-full">
        <div ref={scrollContainerRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 sm:px-6 py-6 min-h-0 custom-scrollbar w-full">
          {!sessionReady && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 animate-fade-in my-auto">
              <Loader2 className="h-10 w-10 text-[var(--accent)] animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Initializing Intelligence…</p>
            </div>
          )}
          {sessionReady && messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center animate-fade-in my-auto">
              <div className="mb-8 relative">
                <div className="absolute inset-0 bg-[var(--accent)] blur-[40px] opacity-10 animate-pulse-glow" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-[2.5rem] border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl"><Bot className="h-12 w-12 text-[var(--accent)]" /></div>
              </div>
              <h2 className="mb-3 text-2xl font-black tracking-tight text-[var(--text-primary)]">Command Center</h2>
              <p className="max-w-md text-base leading-relaxed text-[var(--text-muted)]">Connect your team&apos;s knowledge and execute complex workflows.</p>
            </div>
          )}

          {messages.map((m, i) => {
            const isLiveAssistant = m.role === "assistant" && isStreaming && i === messages.length - 1;
            const isUser = m.role === "user";
            const isEditing = editingMessageId === m.id;
            
            return (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} key={m.id || i} className={cn("mx-auto flex w-full max-w-4xl gap-4 group/msg", isUser ? "justify-end" : "justify-start")}>
                {!isUser && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-md"><Bot className="h-5 w-5 text-[var(--accent)]" /></div>}
                <div className={cn("flex max-w-[85%] flex-col gap-3", isUser ? "items-end" : "items-start")}>
                  {!isUser && i === messages.length - 1 && isStreaming && (agentThoughts.length > 0 || agentReflections.length > 0) && (
                    <AgentThinkingPane thoughts={agentThoughts} reflections={agentReflections} isActive={isStreaming} />
                  )}
                  {!isUser && agentStepsForMessage(m).length > 0 && <ChatAgentToolTimeline steps={agentStepsForMessage(m)} />}
                  <div className="relative group/msg-content">
                    <div className={cn("rounded-[1.5rem] px-5 py-4 text-[15px] leading-relaxed shadow-lg transition-all", isUser ? "bg-gradient-to-br from-[var(--accent)] to-[#009ab0] font-semibold text-[var(--bg-950)] rounded-tr-none shadow-[var(--accent-glow)]" : "bg-[var(--surface-1)]/80 backdrop-blur-md border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-tl-none")}>
                        {isEditing ? (
                          <div className="flex flex-col gap-3 min-w-0 w-full">
                            <textarea className="w-full bg-transparent border-none outline-none text-[var(--bg-950)] placeholder:text-[var(--bg-950)]/50 resize-none overflow-hidden" value={editInput} onChange={(e) => { setEditInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} autoFocus />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingMessageId(null)} className="p-1 rounded-lg hover:bg-white/20 transition-colors"><X className="w-4 h-4" /></button>
                                <button onClick={() => handleSaveEdit(m.id)} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"><Check className="w-4 h-4" /></button>
                            </div>
                          </div>
                        ) : m.role === "assistant" ? (
                          <ChatMessageContent content={m.content} streaming={isLiveAssistant} />
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{m.content}</span>
                        )}
                    </div>
                    {isUser && !isEditing && (
                        <button onClick={() => { setEditingMessageId(m.id); setEditInput(m.content); }} className="absolute -left-10 top-2 p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--surface-1)] opacity-0 group-hover/msg:opacity-100 transition-all" title="Edit Message">
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {!isUser && !isLiveAssistant && (
                        <div className="absolute -right-1 -top-9 flex items-center gap-0.5 opacity-0 group-hover/msg-content:opacity-100 transition-all bg-[var(--bg-800)] rounded-lg p-0.5 shadow-lg border border-[var(--border-subtle)]">
                            <button onClick={() => { navigator.clipboard.writeText(m.content); }} className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors" title="Copy Response">
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                            {i === messages.length - 1 && (
                                <button 
                                    onClick={() => {
                                        const lastUser = [...messages].reverse().find(msg => msg.role === "user");
                                        if (lastUser) handleSaveEdit(lastUser.id);
                                    }} 
                                    className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors" 
                                    title="Regenerate"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                  </div>
                  {m.citations && m.citations.length > 0 && <div className="mt-1"><ChatCitationList citations={m.citations} /></div>}
                </div>
                {isUser && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-800)] shadow-md"><User className="h-5 w-5 text-[var(--text-muted)]" /></div>}
              </motion.div>
            );
          })}

          {isStreaming && status && (
             <div className="mx-auto flex w-full max-w-4xl justify-start items-center gap-3 animate-fade-in">
                <div className="flex h-5 w-5 items-center justify-center"><div className="w-2 h-2 bg-[var(--accent)] rounded-full animate-ping" /></div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)] opacity-80">{status}</div>
             </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Scroll-to-bottom FAB */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute right-6 z-30 p-2.5 rounded-full bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] shadow-lg transition-all"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}

        <div className="shrink-0 bg-[var(--bg-950)] px-4 pt-2 w-full z-20">
          <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-2">
            <div className="flex items-center justify-between px-2">
                <ChatModeSegmentedControl value={chatMode} onChange={setChatMode} capabilities={chatCaps} />
            </div>
            <div className="relative group w-full">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-[1.5rem] opacity-0 group-focus-within:opacity-15 blur-md transition-opacity duration-500" />
              <input className="relative w-full rounded-[1.25rem] border border-[var(--border-strong)] bg-[var(--bg-900)] py-3 pl-5 pr-14 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/50 focus:shadow-glow shadow-inner disabled:cursor-not-allowed disabled:opacity-50" placeholder={!sessionReady ? "Initializing Intelligence…" : "Enter command or ask a question…"} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }} disabled={inputTypingDisabled} />
              <button onClick={() => void handleSend()} disabled={sendDisabled} className="absolute right-2 top-1.5 h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--bg-950)] transition-all hover:scale-105 hover:shadow-glow active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
