"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, Maximize2, Minimize2, Loader2, Plus, Layout, Mic, MicOff } from "lucide-react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { ChatMessageContent } from "./ChatMessageContent";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { ChatCapabilities } from "@/components/chat/chatTypes";
import { ChatModeSegmentedControl, type ChatMode } from "@/components/chat/ChatModeSegmentedControl";

type ChatSession = {
  id: string;
  title: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const STARTER_PROMPTS = [
  { label: "Check Roadmap Scheduling", prompt: "Identify any overlapping roadmap milestones or scheduling conflicts in our current sprints." },
  { label: "Analyze Workspace Workload", prompt: "Evaluate team task assignments and flag any over-allocated assignee allocations." }
];

export function FloatingAIChat() {
  const { currentTeamId } = useWikiStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!currentTeamId) return;
    try {
      const data = await api.get<ChatSession[]>(`/chat/${currentTeamId}/sessions/`);
      setSessions(data);
      if (data.length > 0 && !activeSessionId) {
        setActiveSessionId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch sessions", err);
    }
  }, [currentTeamId, activeSessionId]);

  useEffect(() => {
    if (isOpen) fetchSessions();
  }, [isOpen, fetchSessions]);

  useEffect(() => {
    if (!currentTeamId || !isOpen) return;
    let cancelled = false;
    api
      .get<ChatCapabilities>(`/chat/${currentTeamId}/capabilities/`)
      .then((data) => {
        if (cancelled) return;
        setCapabilities(data);
        if (mode === "research" && !data.research_mode_available) {
          setMode("ask");
        }
      })
      .catch((err) => {
        console.error("Failed to fetch chat capabilities", err);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTeamId, isOpen, mode]);

  // Fetch messages for active session
  useEffect(() => {
    if (!currentTeamId || !activeSessionId || !isOpen) return;

    (async () => {
      try {
        const detail = await api.get<{ messages: ChatMessage[] }>(`/chat/${currentTeamId}/sessions/${activeSessionId}/`);
        setMessages(detail.messages || []);
      } catch (err) {
        console.error("Failed to fetch session detail", err);
      }
    })();
  }, [currentTeamId, activeSessionId, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Web Speech recognition setup
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
        const t = "Analyze our strategic workload logs and decompose task constraints.";
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
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      recognition.start();
      setIsRecording(true);
    }
  };

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || !currentTeamId || !activeSessionId || isStreaming) return;
    if (mode === "research" && !capabilities?.research_mode_available) return;

    if (!overrideText) {
      setInput("");
    }
    setIsStreaming(true);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);

    const assistantId = `a-${Date.now()}`;
    let assistantContent = "";
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const auth = await getApiAuthHeaders();
      const res = await fetch(`${API_BASE}/chat/${currentTeamId}/sessions/${activeSessionId}/query/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ message: text, mode }),
      });

      if (!res.ok) throw new Error("Failed to send");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const dataStr = line.replace("data:", "").trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.token) {
                assistantContent += data.token;
                setMessages(prev => {
                  const next = [...prev];
                  const idx = next.findIndex(m => m.id === assistantId);
                  if (idx >= 0) next[idx] = { ...next[idx], content: assistantContent };
                  return next;
                });
              }
            } catch { }
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  }, [input, currentTeamId, activeSessionId, isStreaming, mode, capabilities?.research_mode_available]);

  const handleCreateSession = async () => {
    if (!currentTeamId) return;
    try {
      const created = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, { title: "New Assistant Chat" });
      setSessions(prev => [created, ...prev]);
      setActiveSessionId(created.id);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create session", err);
    }
  };

  if (!currentTeamId) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className={cn(
      "fixed z-[1000] transition-all duration-300 ease-in-out border-none shadow-none",
      isOpen
        ? "bottom-2 left-1/2 -translate-x-1/2 w-[98vw] max-w-[1200px] px-2"
        : "bottom-6 right-6"
    )}>
      {isOpen && !isMinimized && (
        <div className="w-full h-[52vh] max-h-[85vh] bg-[var(--surface-1)]/95 border border-white/10 rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 backdrop-blur-xl shadow-none">
          {/* Header */}
          <div className="p-3 border-b border-white/5 bg-[var(--bg-950)]/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-muted)] transition-colors border border-transparent hover:border-white/5"
                title="Toggle sessions sidebar"
                aria-label="Toggle sessions sidebar"
              >
                <Layout size={18} />
              </button>
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
                <Bot size={18} className="text-[var(--accent)]" />
                AI Architect Hub
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMinimized(true)} 
                className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-dim)] transition-colors border border-transparent hover:border-white/5"
                title="Minimize chat"
                aria-label="Minimize chat"
              >
                <Minimize2 size={16} />
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-dim)] hover:text-rose-400 transition-colors border border-transparent hover:border-white/5"
                title="Close chat"
                aria-label="Close chat"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="px-3 pt-3">
            <ChatModeSegmentedControl value={mode} onChange={setMode} capabilities={capabilities} />
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar (Sessions) */}
            {showSidebar && (
              <div className="w-48 sm:w-56 border-r border-white/5 flex flex-col bg-black/20 shrink-0">
                <div className="p-3">
                  <button
                    onClick={handleCreateSession}
                    className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-primary)] hover:bg-white/10 hover:border-[var(--accent)] transition-all shrink-0 shadow-none"
                  >
                    <Plus size={14} /> New Chat
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1 custom-scrollbar">
                  {sessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSessionId(s.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all truncate border border-transparent",
                        activeSessionId === s.id
                          ? "bg-[var(--accent-subtle)] text-[var(--accent)] font-bold border-[var(--accent)]/20"
                          : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                      )}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 relative bg-[var(--bg-950)]/30 border-none shadow-none">
              
              {/* Message scroll area (only visible if we have messages) */}
              <div className={cn("flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar", !hasMessages && "hidden")}>
                {hasMessages && messages.map((m) => (
                  <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                      m.role === "assistant" ? "bg-[var(--accent-subtle)] border-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 border-white/5 text-[var(--text-muted)]"
                    )}>
                      {m.role === "assistant" ? <Bot size={16} /> : <User size={16} />}
                    </div>
                    <div className={cn(
                      "max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed border-none shadow-none",
                      m.role === "user" ? "bg-[var(--accent)] text-[var(--bg-950)] font-medium rounded-tr-none" : "bg-[var(--surface-2)]/50 backdrop-blur-md border border-white/5 text-[var(--text-primary)] rounded-tl-none"
                    )}>
                      {m.role === "assistant" ? (
                        <ChatMessageContent content={m.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center animate-pulse">
                      <Bot size={16} />
                    </div>
                    <div className="bg-[var(--surface-2)]/50 p-3 rounded-2xl border border-white/5">
                      <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Landing & Bottom Input Transition ─────────────────────── */}
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 240, damping: 28 }}
                className={cn(
                  "w-full transition-all duration-300 border-none shadow-none",
                  hasMessages 
                    ? "shrink-0 p-4 border-t border-white/5 bg-[var(--bg-950)]/50" 
                    : "flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto overflow-y-auto"
                )}
              >
                {!hasMessages && (
                  <motion.div 
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-2 mb-6"
                  >
                    <Bot size={40} className="mx-auto text-[var(--accent)] animate-pulse" />
                    <h3 className="text-lg font-bold text-white">AI Architect Assistant</h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">Ask about your strategic roadmap, scheduling locks, and capacity bottlenecks.</p>
                  </motion.div>
                )}

                {/* Input Area */}
                <div className="relative w-full max-w-2xl">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={isRecording ? "" : "Ask a command or question..."}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-4 pr-24 text-sm text-white focus:outline-none focus:border-[var(--accent)]/50 transition-all placeholder:text-[var(--text-dim)] shadow-none"
                    title="AI Architect prompt"
                  />

                  {/* Soundwave Mic Indicator */}
                  {isRecording && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider animate-pulse">Listening...</span>
                      <div className="flex items-end gap-0.5 h-3 ml-1.5">
                        {[1, 2, 3, 4].map((n) => (
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

                  <div className="absolute right-2 top-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleRecording}
                      title={isRecording ? "Stop recording speech" : "Start recording speech"}
                      aria-label={isRecording ? "Stop recording speech" : "Start recording speech"}
                      className={cn(
                        "p-2 rounded-xl transition-all border border-transparent",
                        isRecording 
                          ? "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20" 
                          : "text-[var(--text-dim)] hover:text-white hover:bg-white/5"
                      )}
                    >
                      {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    <button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || isStreaming}
                      title="Send message"
                      aria-label="Send message"
                      className="p-2 bg-[var(--accent)] text-[var(--bg-950)] rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-none"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>

                {/* Starter Prompts */}
                {!hasMessages && (
                  <motion.div 
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 gap-2 w-full max-w-2xl mt-6"
                  >
                    {STARTER_PROMPTS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => handleSend(p.prompt)}
                        className="p-3 text-left text-xs text-[var(--text-muted)] bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[var(--accent)]/20 rounded-xl transition-all"
                      >
                        <span className="font-semibold text-[var(--text-primary)] block mb-0.5">{p.label}</span>
                        {p.prompt}
                      </button>
                    ))}
                  </motion.div>
                )}
              </motion.div>

            </div>
          </div>
        </div>
      )}

      {isMinimized && isOpen && (
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-[var(--accent)] text-[var(--bg-950)] px-6 py-3 rounded-full font-bold shadow-none flex items-center gap-3 animate-in slide-in-from-right-8 transition-all hover:scale-105"
        >
          <Bot size={20} />
          Intelligence Active
          <Maximize2 size={16} />
        </button>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Open AI Architect Chat"
          aria-label="Open AI Architect Chat"
          className="w-14 h-14 bg-[var(--accent)] text-[var(--bg-950)] rounded-2xl flex items-center justify-center hover:scale-110 transition-all active:scale-95 group relative shadow-none"
        >
          <MessageCircle size={28} className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[var(--bg-950)] animate-pulse animate-duration-1000" />
        </button>
      )}
    </div>
  );
}
