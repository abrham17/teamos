"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { buildChatCitationHref } from "@/lib/chatCitationLink";
import { useWikiStore } from "@/stores/useWikiStore";
import { Send, Bot, User, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type ChatSession = { id: string; title: string };
type Citation = {
  page_slug?: string;
  page_title?: string;
  confidence?: number;
  anchor_hint?: string;
  chunk_id?: string;
  snippet?: string;
};
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[] };
type SessionDetailResponse = { messages?: ChatMessage[] };

export function ChatInterface() {
  const { currentTeamId } = useWikiStore();
  const router = useRouter();
  const { error: toastError } = useToast();
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentTeamId) return;
    api.get<ChatSession[]>(`/chat/${currentTeamId}/sessions/`).then((data) => {
      setSessions(data);
      if (data.length > 0 && !activeSessionId) {
        setActiveSessionId(data[0].id);
      }
    }).catch(console.error);
  }, [currentTeamId, activeSessionId]);

  useEffect(() => {
    if (!currentTeamId || !activeSessionId) return;
    api.get<SessionDetailResponse>(`/chat/${currentTeamId}/sessions/${activeSessionId}/`).then((data) => {
      setMessages(data.messages || []);
    }).catch(console.error);
  }, [currentTeamId, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleNewChat = async () => {
    if (!currentTeamId) return;
    try {
      const data = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, { title: "New Chat" });
      setSessions([data, ...sessions]);
      setActiveSessionId(data.id);
      setMessages([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !currentTeamId || !activeSessionId || isStreaming) return;
    
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg, id: Date.now().toString() }]);
    setIsStreaming(true);
    setStatus("Connecting...");

    try {
      // Use standard fetch for SSE
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/chat/${currentTeamId}/sessions/${activeSessionId}/query/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Include auth headers/cookies in production
        },
        body: JSON.stringify({ message: userMsg })
      });

      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      const assistantMsg: ChatMessage = { role: "assistant", content: "", citations: [], id: Date.now().toString() };
      setMessages(prev => [...prev, assistantMsg]);

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
              const data = JSON.parse(dataStr);
              if (currentEvent === "status") {
                setStatus(data.status);
              } else if (currentEvent === "chunk") {
                setStatus("");
                assistantMsg.content += data.token;
                setMessages(prev => {
                  const newArr = [...prev];
                  newArr[newArr.length - 1] = { ...assistantMsg };
                  return newArr;
                });
              } else if (currentEvent === "citations") {
                assistantMsg.citations = data.citations;
                setMessages(prev => {
                  const newArr = [...prev];
                  newArr[newArr.length - 1] = { ...assistantMsg };
                  return newArr;
                });
              } else if (currentEvent === "done") {
                setIsStreaming(false);
                setStatus("");
              }
            } catch (e) {
              console.error("SSE parse error", e, dataStr);
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      setIsStreaming(false);
      setStatus("Error fetching response.");
      toastError("Failed to connect to AI server.");
    }
  };

  if (!currentTeamId) {
    return <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">Select a team first</div>;
  }

  return (
    <div className="flex h-full bg-[var(--bg-900)] w-full">
      {/* Sidebar */}
      <div className="w-[260px] border-r border-[var(--border-subtle)] bg-[var(--surface-1)] flex flex-col shrink-0">
        <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h2 className="font-semibold text-[var(--text-primary)]">Chat History</h2>
        </div>
        <div className="p-3">
          <button 
            onClick={handleNewChat}
            className="w-full py-2 bg-[var(--bg-800)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-sm rounded-lg flex items-center justify-center gap-2"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {sessions.map(s => (
            <button 
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`text-left text-sm px-3 py-2 rounded-lg truncate ${
                activeSessionId === s.id ? 'bg-[var(--accent)] text-[var(--bg-950)] font-medium' : 'text-[var(--text-muted)] hover:bg-[var(--bg-800)] hover:text-[var(--text-primary)]'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <div className="w-20 h-20 rounded-3xl bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-center mb-6 shadow-xl">
                <Bot className="w-10 h-10 text-[var(--accent)]" />
              </div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Team Intelligence Chat</h2>
              <p className="text-[var(--text-muted)] max-w-sm">
                Ask questions about your team&apos;s knowledge graph. TeamOS will search across all wiki pages and cite its sources.
              </p>
            </div>
          )}
          
          {messages.map((m, i) => (
            <div key={m.id || i} className={`flex gap-4 max-w-4xl mx-auto w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 text-[var(--accent)]" />
                </div>
              )}
              
              <div className={`flex flex-col gap-2 max-w-[85%] ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`p-4 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                  m.role === "user" 
                    ? "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-[var(--bg-950)] font-medium" 
                    : "bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                }`}>
                  {m.content}
                </div>
                
                {m.citations && m.citations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {m.citations.map((c: Citation, idx: number) => (
                      <button 
                        key={idx}
                        onClick={() => router.push(buildChatCitationHref(c))}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-800)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all group"
                        title={c.anchor_hint ? `Jump hint: ${c.anchor_hint}` : "Open source page"}
                      >
                        <FileText className="w-3 h-3" />
                        <span>{c.page_title}</span>
                        {c.confidence && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-md bg-[var(--bg-950)] text-[10px] font-bold text-[var(--accent)] opacity-70 group-hover:opacity-100">
                            {Math.round(c.confidence * 100)}%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {m.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-[var(--bg-800)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 shadow-sm">
                  <User className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
              )}
            </div>
          ))}

          {isStreaming && (
            <div className="flex gap-4 max-w-4xl mx-auto w-full justify-start">
              <div className="w-8 h-8 rounded-full bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="px-4 py-3 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-subtle)] flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" style={{ animation: "bounce-dot 1.4s infinite ease-in-out both" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" style={{ animation: "bounce-dot 1.4s infinite ease-in-out both 0.2s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" style={{ animation: "bounce-dot 1.4s infinite ease-in-out both 0.4s" }} />
                </div>
                {status && (
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-dim)] ml-1">
                    {status}
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-6 border-t border-[var(--border-subtle)] shrink-0 bg-[var(--bg-900)]">
          <div className="max-w-4xl mx-auto relative group">
            <div className="absolute inset-0 bg-[var(--accent)] opacity-0 group-focus-within:opacity-5 blur-xl transition-opacity" />
            <input
              className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl py-4 pl-5 pr-14 text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-subtle)] transition-all shadow-lg"
              placeholder="Ask TeamOS anything..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isStreaming || !activeSessionId}
            />
            <button 
              onClick={handleSend}
              disabled={isStreaming || !input.trim() || !activeSessionId}
              className="absolute right-3 top-3 p-2 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-[var(--bg-950)] rounded-xl disabled:opacity-30 disabled:grayscale transition-all hover:scale-105 active:scale-95 shadow-md"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
