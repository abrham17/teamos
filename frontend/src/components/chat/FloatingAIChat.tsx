"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, Maximize2, Minimize2, Loader2 } from "lucide-react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { ChatMessageContent } from "./ChatMessageContent";

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentTeamId || !isOpen) return;

    (async () => {
      try {
        const sessions = await api.get<{ id: string }[]>(`/chat/${currentTeamId}/sessions/`);
        if (sessions.length > 0) {
          setActiveSessionId(sessions[0].id);
          const detail = await api.get<{ messages: ChatMessage[] }>(`/chat/${currentTeamId}/sessions/${sessions[0].id}/`);
          setMessages(detail.messages || []);
        } else {
          const created = await api.post<{ id: string }>(`/chat/${currentTeamId}/sessions/`, { title: "AI Assistant" });
          setActiveSessionId(created.id);
        }
      } catch (err) {
        console.error("Failed to init chat", err);
      }
    })();
  }, [currentTeamId, isOpen]);

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

  if (!currentTeamId) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end gap-4">
      {isOpen && !isMinimized && (
        <div className="w-96 h-[500px] bg-[var(--surface-1)] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300 backdrop-blur-xl">
          <div className="p-4 border-b border-white/5 bg-[var(--accent)] text-[var(--bg-950)] flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2 font-bold">
              <Bot size={20} />
              AI Assistant
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-black/10 rounded-lg transition-colors">
                <Minimize2 size={16} />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-black/10 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.length === 0 && (
              <div className="text-center py-10">
                <Bot size={40} className="mx-auto text-[var(--text-dim)] mb-2" />
                <p className="text-[var(--text-muted)] text-sm">How can I help you write your Markdown today?</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === "assistant" ? "bg-[var(--accent-subtle)] text-[var(--accent)]" : "bg-white/5 text-[var(--text-muted)]"}`}>
                  {m.role === "assistant" ? <Bot size={16} /> : <User size={16} />}
                </div>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.role === "user" ? "bg-[var(--accent)] text-[var(--bg-950)] font-medium" : "bg-white/5 text-[var(--text-primary)] border border-white/5"}`}>
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
                <div className="w-8 h-8 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center animate-pulse">
                  <Bot size={16} />
                </div>
                <div className="bg-white/5 p-3 rounded-2xl">
                  <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-white/5 bg-white/[0.02]">
            <div className="relative">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask anything..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-dim)]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="absolute right-2 top-1.5 p-2 bg-[var(--accent)] text-[var(--bg-950)] rounded-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-lg"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {isMinimized && isOpen && (
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-[var(--accent)] text-[var(--bg-950)] px-4 py-2 rounded-full font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-right-4 transition-all hover:scale-105"
        >
          <Bot size={20} />
          AI Chat (Active)
          <Maximize2 size={16} />
        </button>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-[var(--accent)] text-[var(--bg-950)] rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all active:scale-95 group"
        >
          <MessageCircle size={28} className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[var(--bg-950)] animate-pulse" />
        </button>
      )}
    </div>
  );
}
