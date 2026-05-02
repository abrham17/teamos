"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { buildChatCitationHref } from "@/lib/chatCitationLink";
import { useWikiStore } from "@/stores/useWikiStore";
import { Send, Bot, User, FileText, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { VoiceChatOverlay, type VoiceOverlayPhase } from "@/components/chat/VoiceChatOverlay";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

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
  const [sessionReady, setSessionReady] = useState(false);

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoiceOverlayPhase>("idle");
  const [voiceCaption, setVoiceCaption] = useState("");
  const [voiceInterim, setVoiceInterim] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceOpenRef = useRef(false);

  const speechSupported = typeof window !== "undefined" && Boolean(getSpeechRecognitionCtor());

  voiceOpenRef.current = voiceOpen;

  /* Bootstrap: always have a session so input is never permanently disabled */
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
          const created = await api.post<ChatSession>(`/chat/${currentTeamId}/sessions/`, {
            title: "New Chat",
          });
          if (cancelled) return;
          setSessions([created]);
          setActiveSessionId(created.id);
        }
      } catch (e) {
        console.error(e);
        toastError("Could not start chat. Check you are signed in.");
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toastError identity must not re-run bootstrap
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

  const speak = useCallback((text: string) => {
    if (!text.trim() || typeof window === "undefined") return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }, []);

  const sendUserMessage = useCallback(
    async (userMsg: string, options?: { speakReply?: boolean }) => {
      const trimmed = userMsg.trim();
      if (!trimmed || !currentTeamId || !activeSessionId || isStreaming) return;

      setIsStreaming(true);
      setStatus("Connecting...");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, id: `u-${Date.now()}` },
      ]);

      const auth = await getApiAuthHeaders();
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: "",
        citations: [],
        id: assistantId,
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
            body: JSON.stringify({ message: trimmed }),
          },
        );

        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
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
                  if (voiceOpenRef.current) {
                    setVoiceCaption(String(data.status ?? ""));
                    setVoicePhase("thinking");
                  }
                } else if (currentEvent === "chunk") {
                  setStatus("");
                  const token = String((data as { token?: string }).token ?? "");
                  working = { ...working, content: working.content + token };
                  if (voiceOpenRef.current) {
                    setVoicePhase("speaking");
                    setVoiceCaption(working.content.slice(-400) || "…");
                  }
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
                } else if (currentEvent === "done") {
                  setIsStreaming(false);
                  setStatus("");
                  if (voiceOpenRef.current) {
                    setVoicePhase("idle");
                    setVoiceCaption(
                      working.content
                        ? "Here’s what I found. You can read the full reply in the chat."
                        : "Done.",
                    );
                  }
                  if (options?.speakReply && working.content) {
                    speak(working.content);
                  }
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
        if (voiceOpenRef.current) {
          setVoicePhase("idle");
          setVoiceCaption("Something went wrong. Try again or use text chat.");
        }
      } finally {
        setIsStreaming(false);
        setStatus("");
      }
    },
    [activeSessionId, currentTeamId, isStreaming, speak, toastError],
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
    setInput("");
    await sendUserMessage(text, { speakReply: false });
  };

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setVoiceListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toastError("Voice input is not supported in this browser.");
      return;
    }
    stopRecognition();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    setVoiceInterim("");
    setVoiceCaption("Listening…");
    setVoicePhase("listening");

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const piece = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += piece;
        else interim += piece;
      }
      setVoiceInterim(interim);
      if (finalText.trim()) {
        const q = finalText.trim();
        setVoiceInterim("");
        stopRecognition();
        setVoicePhase("thinking");
        setVoiceCaption("Searching your wiki…");
        void sendUserMessage(q, { speakReply: true });
      }
    };

    rec.onerror = () => {
      setVoiceListening(false);
      setVoicePhase("idle");
      setVoiceCaption("Could not hear that. Try again.");
    };

    rec.onend = () => {
      setVoiceListening(false);
      setVoicePhase((p) => (p === "listening" ? "idle" : p));
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setVoiceListening(true);
    } catch {
      toastError("Could not start the microphone.");
      setVoiceListening(false);
    }
  }, [sendUserMessage, stopRecognition, toastError]);

  const toggleVoiceMic = () => {
    if (voiceListening) stopRecognition();
    else startRecognition();
  };

  useEffect(() => {
    return () => {
      stopRecognition();
      if (typeof window !== "undefined") window.speechSynthesis.cancel();
    };
  }, [stopRecognition]);

  if (!currentTeamId) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        Select a team first
      </div>
    );
  }

  const inputDisabled = isStreaming || !activeSessionId || !sessionReady;

  return (
    <div className="flex h-full w-full bg-[var(--bg-900)]">
      <VoiceChatOverlay
        open={voiceOpen}
        onClose={() => {
          setVoiceOpen(false);
          stopRecognition();
          setVoiceCaption("");
          setVoiceInterim("");
          setVoicePhase("idle");
          if (typeof window !== "undefined") window.speechSynthesis.cancel();
        }}
        phase={voicePhase}
        caption={voiceCaption}
        interimTranscript={voiceInterim}
        listening={voiceListening}
        speechSupported={speechSupported}
        micDisabled={isStreaming}
        onToggleMic={toggleVoiceMic}
      />

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
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-[var(--border-subtle)] px-6 py-3">
          <button
            type="button"
            onClick={() => {
              setVoiceOpen(true);
              setVoiceCaption("Tap the mic and ask your question.");
              setVoicePhase("idle");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Mic className="h-4 w-4" />
            Voice chat
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-xl">
                <Bot className="h-10 w-10 text-[var(--accent)]" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-[var(--text-primary)]">Team Intelligence Chat</h2>
              <p className="max-w-sm text-[var(--text-muted)]">
                Ask questions about your team&apos;s wiki. Answers can include{" "}
                <strong className="text-[var(--text-secondary)]">tables and charts</strong> (Markdown + Mermaid) when
                the data supports it. Use{" "}
                <strong className="text-[var(--text-secondary)]">Voice chat</strong> for a larger voice panel with
                animated feedback.
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-sm">
                  <Bot className="h-4 w-4 text-[var(--accent)]" />
                </div>
              )}

              <div className={`flex max-w-[85%] flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl p-4 text-[15px] leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] font-medium text-[var(--bg-950)]"
                      : "border border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <ChatMessageContent content={m.content} streaming={isLiveAssistant} />
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  )}
                </div>

                {m.citations && m.citations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {m.citations.map((c: Citation, idx: number) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => router.push(buildChatCitationHref(c))}
                        className="group flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        title={c.anchor_hint ? `Jump hint: ${c.anchor_hint}` : "Open source page"}
                      >
                        <FileText className="h-3 w-3" />
                        <span>{c.page_title}</span>
                        {c.confidence ? (
                          <span className="ml-1 rounded-md bg-[var(--bg-950)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)] opacity-70 group-hover:opacity-100">
                            {Math.round(c.confidence * 100)}%
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-800)] shadow-sm">
                  <User className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
              )}
            </div>
            );
          })}

          {isStreaming && (
            <div className="mx-auto flex w-full max-w-4xl justify-start gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-sm">
                <Bot className="h-4 w-4 text-[var(--accent)]" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                    style={{ animation: "bounce-dot 1.4s infinite ease-in-out both" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                    style={{ animation: "bounce-dot 1.4s infinite ease-in-out both 0.2s" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
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
          <div className="group relative mx-auto max-w-4xl">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[var(--accent)] opacity-0 blur-xl transition-opacity group-focus-within:opacity-5" />
            <input
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] py-4 pl-5 pr-14 text-[var(--text-primary)] shadow-lg outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={
                sessionReady ? "Ask TeamOS anything…" : "Preparing your chat…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={inputDisabled}
              aria-busy={!sessionReady}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={inputDisabled || !input.trim()}
              className="absolute right-3 top-3 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] p-2 text-[var(--bg-950)] shadow-md transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
