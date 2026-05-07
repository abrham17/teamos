"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { Send, Bot, User } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { ChatCitationList } from "@/components/chat/ChatCitationList";
import { ChatModeSelect, type ChatMode } from "@/components/chat/ChatModeSelect";
import { ChatAgentToolTimeline, type AgentToolStep } from "@/components/chat/ChatAgentToolTimeline";

type ChatSession = { id: string; title: string };
type Citation = {
  source?: "wiki" | "plan" | string;
  title?: string;
  page_slug?: string;
  page_title?: string;
  project_id?: string;
  project_name?: string;
  source_kind?: string;
  confidence?: number;
  anchor_hint?: string;
  chunk_id?: string;
  snippet?: string;
};
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
  toolSteps?: AgentToolStep[];
};
type SessionDetailResponse = { messages?: ChatMessage[] };
type ChatCapabilities = {
  can_edit_wiki: boolean;
  can_edit_plans: boolean;
  can_ingest: boolean;
  agent_mode_available: boolean;
  plan_mode_available: boolean;
};

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
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);


  const [chatMode, setChatMode] = useState<ChatMode>("ask");
  const [chatCaps, setChatCaps] = useState<ChatCapabilities | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* Bootstrap: load or create a session; typing stays enabled when only session id is missing */
  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    setSessionReady(false);
    setBootstrapError(null);
    (async () => {
      try {
        const data = await api.get<ChatSession[]>(`/chat/${currentTeamId}/sessions/`);
        if (cancelled) return;
        setSessions(data);
        if (data.length > 0) {
          setActiveSessionId((prev) =>
            prev && data.some((s) => s.id === prev) ? prev : data[0].id,
          );
          setBootstrapError(null);
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
          setBootstrapError(null);
        }
      } catch (e) {
        console.error(e);
        const msg = "Could not start chat. Check you are signed in and try again.";
        setBootstrapError(msg);
        toastError(msg);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toastError identity must not re-run bootstrap
  }, [currentTeamId]);

  const retryBootstrap = useCallback(() => {
    if (!currentTeamId) return;
    setBootstrapError(null);
    setSessionReady(false);
    void (async () => {
      try {
        const data = await api.get<ChatSession[]>(`/chat/${currentTeamId}/sessions/`);
        setSessions(data);
        if (data.length > 0) {
          setActiveSessionId((prev) =>
            prev && data.some((s) => s.id === prev) ? prev : data[0].id,
          );
          setBootstrapError(null);
        } else {
          const created = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, {
            title: "New Chat",
          });
          setSessions([created]);
          setActiveSessionId(created.id);
          setBootstrapError(null);
        }
      } catch (e) {
        console.error(e);
        const msg = "Could not start chat. Check you are signed in and try again.";
        setBootstrapError(msg);
        toastError(msg);
      } finally {
        setSessionReady(true);
      }
    })();
  }, [currentTeamId, toastError]);

  useEffect(() => {
    if (!currentTeamId) return;
    try {
      const v = sessionStorage.getItem(`teamos-chat-mode-${currentTeamId}`);
      if (v === "agent" || v === "ask" || v === "plan") setChatMode(v);
    } catch {
      /* ignore */
    }
  }, [currentTeamId]);

  useEffect(() => {
    if (!currentTeamId) return;
    try {
      sessionStorage.setItem(`teamos-chat-mode-${currentTeamId}`, chatMode);
    } catch {
      /* ignore */
    }
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
    return () => {
      cancelled = true;
    };
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


  const sendUserMessage = useCallback(
    async (userMsg: string, options?: { mode?: ChatMode }) => {
      const trimmed = userMsg.trim();
      if (!trimmed || !currentTeamId || !activeSessionId || isStreaming) return;

      const mode = options?.mode ?? chatMode;

      setIsStreaming(true);
      setStatus("Connecting...");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, id: `u-${Date.now()}`, metadata: { mode } },
      ]);

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
            headers: {
              "Content-Type": "application/json",
              ...auth,
            },
            credentials: "include",
            body: JSON.stringify({ message: trimmed, mode }),
          },
        );

        if (!res.ok) {
          const raw = await res.text();
          let errText = raw || res.statusText;
          try {
            const j = JSON.parse(raw) as { error?: { message?: string } };
            if (j?.error?.message) errText = j.error.message;
          } catch {
            /* keep raw */
          }
          throw new Error(errText || res.statusText);
        }
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
                    if (steps[i].name === name && steps[i].ok === undefined) {
                      li = i;
                      break;
                    }
                  }
                  if (li >= 0) {
                    steps[li] = { ...steps[li], ok, result };
                  }
                  working = { ...working, toolSteps: steps };
                  setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = { ...working };
                    return next;
                  });
                } else if (currentEvent === "done") {
                  const trace = (data as { tool_trace?: AgentToolStep[] }).tool_trace;
                  if (trace && trace.length) {
                    working = {
                      ...working,
                      toolSteps: trace.map((t) => ({
                        name: t.name,
                        arguments: (t as { arguments?: string }).arguments,
                        ok: (t as { result?: { ok?: boolean } }).result?.ok,
                        result: (t as { result?: unknown }).result,
                      })),
                      metadata: { ...(working.metadata ?? {}), tool_trace: trace },
                    };
                    setMessages((prev) => {
                      const next = [...prev];
                      next[next.length - 1] = { ...working };
                      return next;
                    });
                  }
                  setIsStreaming(false);
                  setStatus("");
                } else if (currentEvent === "error") {
                  throw new Error(String((data as { detail?: string }).detail ?? "Stream error"));
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
        setIsStreaming(false);
        setStatus("Error fetching response.");
        toastError("Failed to connect to AI server.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setIsStreaming(false);
        setStatus("");
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (!activeSessionId) {
      toastError("Chat session is not ready. Tap Retry or wait for the session to load.");
      return;
    }
    setInput("");
    await sendUserMessage(text);
  };


  if (!currentTeamId) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        Select a team first
      </div>
    );
  }

  /** Allow typing while session is preparing or after a failed bootstrap; only send requires a session. */
  const inputTypingDisabled = isStreaming || !sessionReady;
  const sendDisabled =
    isStreaming || !sessionReady || !activeSessionId || !input.trim();

  return (
    <div className="flex h-full w-full bg-[var(--bg-900)]">

      {/* Sidebar */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
          <h2 className="font-semibold text-[var(--text-primary)]">Chat History</h2>
        </div>
        <div className="p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] py-2 text-sm hover:border-[var(--accent)]"
          >
            + New Chat
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {sessions.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`truncate rounded-lg px-3 py-2 text-left text-sm ${
                activeSessionId === s.id
                  ? "bg-[var(--accent)] font-medium text-[var(--bg-950)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-800)] hover:text-[var(--text-primary)]"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
                <Bot className="h-10 w-10 text-[var(--text-muted)]" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-[var(--text-primary)]">Team Intelligence Chat</h2>
              <p className="max-w-sm text-[var(--text-muted)]">
                Ask questions about your team&apos;s wiki. Answers can include{" "}
                <strong className="text-[var(--text-secondary)]">tables and charts</strong> (Markdown + Mermaid) when
                the data supports it.
              </p>
            </div>
          )}

          {messages.map((m, i) => {
            const isLiveAssistant =
              m.role === "assistant" && isStreaming && i === messages.length - 1;
            return (
            <div
              key={m.id || i}
              className={`mx-auto flex w-full max-w-4xl gap-4 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)]">
                  <Bot className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
              )}

              <div className={`flex max-w-[85%] flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && agentStepsForMessage(m).length > 0 ? (
                  <ChatAgentToolTimeline steps={agentStepsForMessage(m)} />
                ) : null}
                <div
                  className={`rounded-2xl p-4 text-[15px] leading-relaxed ${
                    m.role === "user"
                      ? "border border-[var(--border-subtle)] bg-[var(--accent)] font-medium text-[var(--bg-950)]"
                      : "border border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <ChatMessageContent content={m.content} streaming={isLiveAssistant} />
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  )}
                </div>

                {m.citations && m.citations.length > 0 ? <ChatCitationList citations={m.citations} /> : null}
              </div>

              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-800)]">
                  <User className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
              )}
            </div>
            );
          })}

          {isStreaming && (
            <div className="mx-auto flex w-full max-w-4xl justify-start gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)]">
                <Bot className="h-4 w-4 text-[var(--text-muted)]" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]"
                    style={{ animation: "bounce-dot 1.4s infinite ease-in-out both" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]"
                    style={{ animation: "bounce-dot 1.4s infinite ease-in-out both 0.2s" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]"
                    style={{ animation: "bounce-dot 1.4s infinite ease-in-out both 0.4s" }}
                  />
                </div>
                {status ? (
                  <div className="ml-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                    {status}
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-900)] p-6">
          <div className="relative mx-auto flex max-w-4xl items-stretch gap-2">
            <ChatModeSelect
              value={chatMode}
              onChange={setChatMode}
              capabilities={
                chatCaps
                ?? {
                  can_edit_wiki: false,
                  can_edit_plans: false,
                  can_ingest: false,
                  agent_mode_available: false,
                  plan_mode_available: false,
                }
              }
            />
            <div className="relative min-w-0 flex-1">
            <input
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] py-4 pl-5 pr-14 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-subtle)] focus:ring-1 focus:ring-[var(--border-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={
                !sessionReady
                  ? "Preparing your chat…"
                  : !activeSessionId
                    ? "Type a message — connect a session with Retry above, or wait…"
                    : "Ask TeamOS anything…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={inputTypingDisabled}
              aria-busy={!sessionReady}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sendDisabled}
              className="absolute right-3 top-3 rounded-xl bg-[var(--accent)] p-2 text-[var(--bg-950)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Send className="h-5 w-5" />
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
