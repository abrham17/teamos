"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, Maximize2, Minimize2, Loader2, Plus, Layout } from "lucide-react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { ChatMessageContent } from "./ChatMessageContent";
import { cn } from "@/lib/utils";

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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !currentTeamId || !activeSessionId || isStreaming) return;

    setInput("");
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
        body: JSON.stringify({ message: text, mode: "ask" }),
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
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  }, [input, currentTeamId, activeSessionId, isStreaming]);

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

  return (
    <div className={cn(
      "fixed z-[1000] transition-all duration-300 ease-in-out",
      isOpen 
        ? "bottom-2 left-1/2 -translate-x-1/2 w-[95vw] max-w-[1200px]" 
        : "bottom-6 right-6"
    )}>
      {isOpen && !isMinimized && (
        <div className="w-full h-[50vh] max-h-[80vh] bg-[var(--surface-1)] border border-white/10 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 backdrop-blur-xl">
          {/* Header */}
          <div className="p-3 border-b border-white/5 bg-[var(--bg-950)]/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-muted)] transition-colors"
              >
                <Layout size={18} />
              </button>
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
                <Bot size={18} className="text-[var(--accent)]" />
                Intelligence Hub
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsMinimized(true)} className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-dim)] transition-colors">
                <Minimize2 size={16} />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-dim)] hover:text-rose-400 transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar (Sessions) */}
            {showSidebar && (
              <div className="w-64 border-r border-white/5 flex flex-col bg-black/20">
                <div className="p-3">
                  <button 
                    onClick={handleCreateSession}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)] hover:bg-white/10 hover:border-[var(--accent)] transition-all shrink-0"
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
                        "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all truncate",
                        activeSessionId === s.id 
                          ? "bg-[var(--accent-subtle)] text-[var(--accent)] font-bold border border-[var(--accent)]/20"
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
            <div className="flex-1 flex flex-col min-w-0 relative bg-[var(--bg-950)]/30">
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
                    <Bot size={48} className="mb-4 text-[var(--accent)]" />
                    <p className="text-sm">How can I assist your team today?</p>
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                      m.role === "assistant" ? "bg-[var(--accent-subtle)] border-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 border-white/5 text-[var(--text-muted)]"
                    )}>
                      {m.role === "assistant" ? <Bot size={16} /> : <User size={16} />}
                    </div>
                    <div className={cn(
                      "max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed",
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

              {/* Input */}
              <div className="p-4 border-t border-white/5 bg-[var(--bg-950)]/50">
                <div className="relative max-w-3xl mx-auto">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder="Type a command or question..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-dim)] shadow-inner"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    className="absolute right-2 top-1.5 p-2 bg-[var(--accent)] text-[var(--bg-950)] rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-lg"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isMinimized && isOpen && (
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-[var(--accent)] text-[var(--bg-950)] px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-8 transition-all hover:scale-105"
        >
          <Bot size={20} />
          Intelligence Active
          <Maximize2 size={16} />
        </button>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-[var(--accent)] text-[var(--bg-950)] rounded-2xl shadow-2xl flex items-center justify-center hover:scale-110 transition-all active:scale-95 group relative"
        >
          <MessageCircle size={28} className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[var(--bg-950)] animate-pulse" />
        </button>
      )}
    </div>
  );
}
