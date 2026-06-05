"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { api, getApiAuthHeaders } from "@/lib/api";
import { useWikiStore } from "@/stores/useWikiStore";
import { Bot, User, Pencil, X, Check, Copy, RotateCcw, ArrowDown, Loader2, BrainCircuit, Search, BookOpen, ArrowUp, Mic, MicOff, Globe2, PlusCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { ChatCitationList } from "@/components/chat/ChatCitationList";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { ChatSession, Citation, ChatMessage, AgentToolStep, AgentStrategy, ActivityEntry, ChatCapabilities, CrewAgentProgress, CrewMessage, GuardianBlock } from "@/components/chat/chatTypes";
import { AgentActivityFeed } from "@/components/chat/AgentActivityFeed";
import { CollapsibleThoughtBlock } from "@/components/chat/CollapsibleThoughtBlock";
import { CrewActivityPanel } from "@/components/chat/CrewActivityPanel";
import { GuardianBlockCard } from "@/components/chat/GuardianBlockCard";
import { IntentAcknowledgmentCard } from "@/components/chat/IntentAcknowledgmentCard";
import { QuestionCard } from "@/components/chat/QuestionCard";

type SessionDetailResponse = { messages?: ChatMessage[] };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const QUICK_PROMPTS = [
  { label: "Search the Knowledge Base", desc: "Find and summarize relevant wiki pages and documents.", icon: Search, prompt: "Search our wiki and summarize everything we have about our onboarding process." },
  { label: "Research & Analyze", desc: "Investigate market trends, competitors, or any topic.", icon: BrainCircuit, prompt: "Research the top 5 AI workspace tools and compare their key features and pricing models." },
  { label: "Draft a System Brief", desc: "Formulate architectural descriptions, component specs, and API lists.", icon: BookOpen, prompt: "Write an architectural system brief for a microservices-based notification engine." },
  { label: "Summarize Recent Activity", desc: "Get a concise summary of recent team wiki updates.", icon: User, prompt: "Summarize all wiki pages updated in the last week and highlight any critical changes." }
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
  const [strategy, setStrategy] = useState<AgentStrategy | null>(null);
  const [capabilities, setCapabilities] = useState<ChatCapabilities | null>(null);
  const [researchRequested, setResearchRequested] = useState(false);

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

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    setSessionReady(false);

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
    if (!currentTeamId) {
      setCapabilities(null);
      return;
    }

    let cancelled = false;
    api
      .get<ChatCapabilities>(`/chat/${currentTeamId}/capabilities/`)
      .then((data) => {
        if (cancelled) return;
        setCapabilities(data);
        if (!data.research_mode_available) {
          setResearchRequested(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load chat capabilities", err);
        if (!cancelled) setCapabilities(null);
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

  const handleCorrectRoute = useCallback(
    (mode: "ask" | "research") => {
      abortControllerRef.current?.abort();
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      setMessages((prev) => prev.filter((m) => m.isStreaming !== true));
      setIsStreaming(false);
      setStatus("");
      setTimeout(() => sendUserMessage(lastUser.content, mode), 80);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages]
  );

  const sendUserMessage = useCallback(
    async (userMsg: string, modeOverride?: "ask" | "research") => {
      const trimmed = userMsg.trim();
      if (!trimmed || !currentTeamId || !activeSessionId || isStreaming) return;
      if (researchRequested && !capabilities?.research_mode_available) {
        toastError("Research mode is not available for this team.");
        return;
      }

      setIsStreaming(true);
      setStatus(researchRequested && !modeOverride ? "Searching external sources..." : "Analyzing mission...");
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
        reasoning: "",
        activityFeed: [],
        guardianBlocks: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const resolvedMode = modeOverride ?? (researchRequested ? "research" : "ask");

      try {
        abortControllerRef.current = new AbortController();
        const res = await fetch(
          `${API_BASE}/chat/${currentTeamId}/sessions/${activeSessionId}/query/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            credentials: "include",
            body: JSON.stringify({ message: trimmed, mode: resolvedMode }),
            signal: abortControllerRef.current.signal,
          },
        );

        if (!res.ok) throw new Error("Stream error");
        if (!res.body) throw new Error("No body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let working = { ...assistantMsg };
        let buffer = "";

        const pushActivity = (entry: ActivityEntry) => {
          working = {
            ...working,
            activityFeed: [...(working.activityFeed || []), entry],
          };
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...working };
            return next;
          });
        };

        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

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
                    working = { ...working, strategy: strat };
                    setMessages((prev) => {
                      const next = [...prev];
                      next[next.length - 1] = { ...working };
                      return next;
                    });
                  } else if (currentEvent === "crew_start") {
                    const roles = ((data as { roles?: string[] }).roles ?? []) as string[];
                    working = {
                      ...working,
                      crewProgress: {
                        agents: roles.map((r): CrewAgentProgress => ({
                          role: r,
                          status: "queued",
                          current_action: "Queued — waiting for supervisor",
                        })),
                        messages: [],
                        isCompleted: false,
                      },
                    };
                    setMessages((prev) => {
                      const next = [...prev];
                      next[next.length - 1] = { ...working };
                      return next;
                    });
                  } else if (currentEvent === "crew_update") {
                    const node = String((data as { node?: string }).node ?? "");
                    const nodeData = ((data as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
                    if (working.crewProgress) {
                      const completed = (nodeData.completed_agents as string[] | undefined) ?? [];
                      const rawMsgs = (nodeData.agent_messages as Array<Record<string, unknown>> | undefined) ?? [];
                      const updatedMsgs: CrewMessage[] = rawMsgs.map((m) => ({
                        from: String(m.from ?? ""),
                        to: m.to ? String(m.to) : undefined,
                        content: String(m.content ?? ""),
                        timestamp: Number(m.timestamp ?? Date.now()),
                      }));
                      const updatedAgents: CrewAgentProgress[] = working.crewProgress.agents.map((agent) => {
                        if (completed.includes(agent.role)) {
                          return { ...agent, status: "done", current_action: "Completed" };
                        }
                        if (node === `agent_${agent.role}`) {
                          return { ...agent, status: "executing", current_action: "Running — reasoning and executing tools" };
                        }
                        if (node === "supervisor" && agent.status === "executing") {
                          return { ...agent, status: "thinking", current_action: "Awaiting supervisor synthesis" };
                        }
                        return agent;
                      });
                      working = {
                        ...working,
                        crewProgress: {
                          agents: updatedAgents,
                          messages: updatedMsgs.length > 0 ? updatedMsgs : working.crewProgress.messages,
                          isCompleted: completed.length > 0 && completed.length >= working.crewProgress.agents.length,
                        },
                      };
                      setMessages((prev) => {
                        const next = [...prev];
                        next[next.length - 1] = { ...working };
                        return next;
                      });
                    }
                  } else if (currentEvent === "guardian_block") {
                    const block = data as GuardianBlock;
                    working = {
                      ...working,
                      guardianBlocks: [...(working.guardianBlocks ?? []), block],
                    };
                    setMessages((prev) => {
                      const next = [...prev];
                      next[next.length - 1] = { ...working };
                      return next;
                    });
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
                  } else if (currentEvent === "research_start") {
                    setStatus(String(data.status ?? "Searching external sources..."));
                    pushActivity({
                      id: `research-start-${Date.now()}`,
                      timestamp: Date.now(),
                      kind: "status",
                      message: String(data.status ?? "Searching external sources..."),
                      detail: { query: String(data.query ?? "") },
                      status: "running",
                    });
                  } else if (currentEvent === "research_search_call") {
                    pushActivity({
                      id: `research-search-${Date.now()}`,
                      timestamp: Date.now(),
                      kind: "tool",
                      message: "Searching the web",
                      detail: {
                        query: String(data.query ?? ""),
                        max_results: Number(data.max_results ?? 5),
                      },
                      status: "running",
                    });
                  } else if (currentEvent === "research_search_results") {
                    const results = Array.isArray((data as { results?: unknown[] }).results) ? (data as { results: Array<Record<string, unknown>> }).results : [];
                    const urls = results.map((r) => String(r.url ?? "")).filter(Boolean);
                    pushActivity({
                      id: `research-results-${Date.now()}`,
                      timestamp: Date.now(),
                      kind: "tool",
                      message: `Found ${Number(data.count ?? results.length)} web sources`,
                      detail: {
                        query: String(data.query ?? ""),
                        urls,
                      },
                      status: "done",
                    });
                  } else if (currentEvent === "research_read_call") {
                    pushActivity({
                      id: `research-read-${Date.now()}`,
                      timestamp: Date.now(),
                      kind: "tool",
                      message: "Reading source page",
                      detail: { url: String(data.url ?? "") },
                      status: "running",
                    });
                  } else if (currentEvent === "research_read_complete") {
                    pushActivity({
                      id: `research-read-done-${Date.now()}`,
                      timestamp: Date.now(),
                      kind: "tool",
                      message: "Finished reading source page",
                      detail: {
                        url: String(data.url ?? ""),
                        title: String(data.title ?? ""),
                        content_chars: Number(data.content_chars ?? 0),
                      },
                      status: "done",
                    });
                  } else if (currentEvent === "research_save_wiki") {
                    pushActivity({
                      id: `research-save-${Date.now()}`,
                      timestamp: Date.now(),
                      kind: "status",
                      message: "Queued wiki save for research findings",
                      detail: {
                        job_id: String(data.job_id ?? ""),
                        title: String(data.title ?? ""),
                      },
                      status: "running",
                    });
                  } else if (currentEvent === "research_complete") {
                    pushActivity({
                      id: `research-complete-${Date.now()}`,
                      timestamp: Date.now(),
                      kind: "status",
                      message: String(data.status ?? "Research complete"),
                      status: "done",
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
                      working = { ...working, reasoning: (working.reasoning ?? "") + content, isStreaming: true };
                      setMessages((prev) => {
                        const next = [...prev];
                        next[next.length - 1] = { ...working };
                        return next;
                      });
                    }
                  } else if (currentEvent === "reflection") {
                    // Reflection feedback is handled via agent_activity events
                  } else if (currentEvent === "agent_activity") {
                    const activityData = data as unknown as ActivityEntry;
                    if (activityData.message) {
                      const entry: ActivityEntry = {
                        id: activityData.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        timestamp: activityData.timestamp || Date.now(),
                        kind: activityData.kind || "status",
                        message: activityData.message,
                        detail: activityData.detail,
                        status: activityData.status || "running",
                      };
                      working = {
                        ...working,
                        activityFeed: [...(working.activityFeed || []), entry],
                      };
                      setMessages((prev) => {
                        const next = [...prev];
                        next[next.length - 1] = { ...working };
                        return next;
                      });
                    }
                  } else if (currentEvent === "ask_user") {
                    const q = data as { question?: string; options?: string[] };
                    working = {
                      ...working,
                      isStreaming: false,
                      question: {
                        question: q.question || "Could you share more details?",
                        options: Array.isArray(q.options) ? q.options : undefined,
                      },
                    };
                    setIsStreaming(false);
                    setMessages((prev) => {
                      const next = [...prev];
                      next[next.length - 1] = { ...working };
                      return next;
                    });
                  } else if (currentEvent === "replan") {
                    setStatus("Replanning approach...");
                  } else if (currentEvent === "done") {
                    setIsStreaming(false);
                    setStatus("");
                    working = { ...working, isStreaming: false };
                    setMessages((prev) => {
                      const next = [...prev];
                      next[next.length - 1] = { ...working };
                      return next;
                    });
                  } else if (currentEvent === "error") {
                    throw new Error("Stream error");
                  }
                } catch { /* skip parse errs */ }
              }
            }
          }
          if (done) {
            if (buffer.trim()) {
              const lines = buffer.split("\n");
              let currentEvent = "";
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  currentEvent = line.replace("event:", "").trim();
                } else if (line.startsWith("data:")) {
                  const dataStr = line.replace("data:", "").trim();
                  if (!dataStr) continue;
                  try {
                    JSON.parse(dataStr);
                    if (currentEvent === "done") {
                      setIsStreaming(false);
                      working = { ...working, isStreaming: false };
                      setMessages((prev) => {
                        const next = [...prev];
                        next[next.length - 1] = { ...working };
                        return next;
                      });
                    }
                  } catch { /* ignore */ }
                }
              }
            }
            break;
          }
        }
        
        working = { ...working, isStreaming: false };
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...working };
          return next;
        });
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
    [activeSessionId, capabilities?.research_mode_available, currentTeamId, isStreaming, researchRequested, toastError],
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
    setEditingMessageId(null);
    await handleSend(editInput);
  };

  const inputTypingDisabled = isStreaming || !sessionReady || !currentTeamId;
  const sendDisabled = (!isStreaming && !input.trim()) || !sessionReady || !activeSessionId || !currentTeamId;

  const hasMessages = messages.length > 0;

  const activeSessionTitle = useMemo(() => {
    const s = sessions.find((s) => s.id === activeSessionId);
    return s ? s.title : "Infrastructure Alignment: Orion";
  }, [sessions, activeSessionId]);

  return (
    <div className="flex h-full w-full flex-1 bg-[var(--bg-950)] overflow-hidden border-none shadow-none font-sans text-[var(--text-primary)]">
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden w-full h-full border-none shadow-none bg-[var(--bg-900)]">
        {!currentTeamId ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center space-y-4 my-auto">
            <div className="relative w-16 h-16 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--border-subtle)] flex items-center justify-center">
              <Bot className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Select a Team</h3>
              <p className="text-sm text-[var(--text-muted)]">Select a workspace team from the sidebar dropdown, or create a new team to begin chatting with TeamOS AI.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-[var(--bg-900)]">
            
            {/* ── Compact Claude-style Header ───────────────────────── */}
            <header className="h-[52px] border-b border-[var(--border-subtle)] flex items-center justify-between px-6 shrink-0 relative z-10 select-none">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {activeSessionTitle}
              </h2>
              <button
                onClick={handleNewChat}
                className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)]/60 transition-colors cursor-pointer"
                title="New Chat"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            </header>

            {/* ── Messages scroll area ─────────────────────────── */}
            <div 
              ref={scrollContainerRef} 
              className={cn(
                "flex-1 overflow-y-auto px-6 sm:px-8 py-8 min-h-0 custom-scrollbar w-full border-none shadow-none", 
                !hasMessages && "hidden"
              )}
            >
              {hasMessages && messages.map((m, i) => {
                const isLiveAssistant = m.role === "assistant" && isStreaming && i === messages.length - 1;
                const isUser = m.role === "user";
                const isEditing = editingMessageId === m.id;

                const effectiveEntries = m.activityFeed && m.activityFeed.length > 0
                  ? m.activityFeed
                  : (m.toolSteps && m.toolSteps.length > 0)
                  ? m.toolSteps.map((s, idx) => ({
                      id: `step-${idx}-${m.id}`,
                      timestamp: Date.now(),
                      kind: "tool" as const,
                      message: `Tool Call: ${s.name}`,
                      status: s.ok === true ? "done" as const : s.ok === false ? "error" as const : "running" as const,
                    }))
                  : [];
                
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 12 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    key={m.id || i} 
                    className={cn(
                      "mx-auto flex w-full max-w-3xl py-4 group/msg border-none shadow-none", 
                      isUser ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn("flex flex-col gap-1 min-w-0 max-w-[85%]", isUser ? "items-end" : "items-start w-full")}>
                      
                      {!isUser && (
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] select-none">
                            <Bot className="h-4 w-4 text-[var(--bg-950)]" />
                          </div>
                          <span className="text-[9px] text-[var(--text-dim)] font-mono opacity-0 group-hover/msg:opacity-100 transition-opacity select-none">
                            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}

                      {isUser && (
                        <div className="flex items-center gap-2 mb-1 px-1 opacity-0 group-hover/msg:opacity-100 transition-opacity h-4 select-none">
                          <span className="text-[9px] text-[var(--text-dim)] font-mono">
                            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                      
                      <div className="relative group/msg-content w-full">
                        <div className={cn(
                          "text-[14px] leading-relaxed",
                          isUser
                            ? "bg-[var(--bg-800)] px-4 py-2.5 rounded-2xl text-[var(--text-primary)] inline-block text-left"
                            : "bg-transparent text-[var(--text-primary)] w-full"
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
                              <div className="w-full max-w-none overflow-x-auto space-y-3">
                                {isLiveAssistant && status && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] select-none">
                                    <Loader2 className="w-3.5 h-3.5 text-[var(--accent)] animate-spin shrink-0" />
                                    <span>{status}</span>
                                  </div>
                                )}
                                {/* Intent Acknowledgment Card */}
                                {m.strategy && (
                                  <IntentAcknowledgmentCard
                                    strategy={m.strategy}
                                    onCorrectRoute={handleCorrectRoute}
                                    collapsed={!!(m.content || (m.activityFeed?.length ?? 0) > 0 || m.reasoning)}
                                    canRoute={!!(m.isStreaming ?? isLiveAssistant)}
                                  />
                                )}
                                {/* Live crew panel */}
                                {m.crewProgress && (
                                  <CrewActivityPanel
                                    progress={m.crewProgress}
                                    isRunning={!!(m.isStreaming ?? isLiveAssistant)}
                                  />
                                )}
                                {/* Agent activity feed */}
                                {effectiveEntries.length > 0 && (
                                  <AgentActivityFeed
                                    entries={effectiveEntries}
                                    isRunning={!!(m.isStreaming ?? isLiveAssistant)}
                                  />
                                )}
                                {/* Three-layer thinking block */}
                                {m.reasoning && (
                                  <CollapsibleThoughtBlock
                                    thoughtText={m.reasoning}
                                    isStreaming={m.isStreaming ?? isLiveAssistant}
                                  />
                                )}
                                {/* Guardian blocks */}
                                {m.guardianBlocks && m.guardianBlocks.length > 0 && (
                                  <div className="space-y-1.5">
                                    {m.guardianBlocks.map((block) => (
                                      <GuardianBlockCard key={block.id} block={block} />
                                    ))}
                                  </div>
                                )}
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
                      {m.citations && m.citations.length > 0 && <div className="mt-2 w-full"><ChatCitationList citations={m.citations} /></div>}

                      {/* Inline QuestionCard */}
                      {m.question && (
                        <QuestionCard
                          question={m.question.question}
                          options={m.question.options}
                          isProcessing={isStreaming}
                          onSelect={(answer) => {
                            setMessages((prev) =>
                              prev.map((msg) =>
                                msg.id === m.id ? { ...msg, question: undefined } : msg
                              )
                            );
                            handleSend(answer);
                          }}
                        />
                      )}

                    </div>
                  </motion.div>
                );
              })}

              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Scroll-to-bottom button */}
            {showScrollBtn && (
              <button
                onClick={scrollToBottom}
                className="absolute right-8 bottom-28 z-30 p-2.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-all shadow-none"
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
                  ? "shrink-0 bg-[var(--bg-950)]/40 backdrop-blur-md px-8 pt-4 pb-6 border-t border-[var(--border-subtle)]" 
                  : "flex-1 justify-center p-6 max-w-4xl mx-auto custom-scrollbar overflow-y-auto"
              )}
            >
              {/* Calm Claude-style Empty State */}
              {!hasMessages && sessionReady && (
                <div className="text-center py-6 select-none">
                  <h1 className="text-3xl font-medium tracking-tight text-[var(--text-primary)] mb-2">
                    TeamOS Chat
                  </h1>
                </div>
              )}

              {/* Textarea Input Card */}
              <div className="w-full max-w-3xl relative">
                <div className="relative w-full group">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-800)] py-3 pl-4 pr-28 text-[15px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-dim)] focus:border-[var(--border-strong)] focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden leading-relaxed"
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

                  {/* Glowing Soundwave Overlay */}
                  {isRecording && (
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none select-none">
                      <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                      <span className="text-xs text-rose-500 font-semibold tracking-wider uppercase">Listening...</span>
                    </div>
                  )}

                  <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setResearchRequested((prev) => !prev)}
                      disabled={!capabilities?.research_mode_available}
                      title={researchRequested ? "Research on" : "Research off"}
                      aria-label={researchRequested ? "Disable research" : "Enable research"}
                      className={cn(
                        "h-8 w-8 flex items-center justify-center rounded-lg transition-all border border-transparent",
                        researchRequested
                          ? "text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/15 border-[var(--accent)]/20"
                          : "text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-white/5",
                        !capabilities?.research_mode_available && "opacity-35 cursor-not-allowed"
                      )}
                    >
                      <Globe2 className="h-4 w-4" />
                    </button>

                    {/* Voice Mic Input */}
                    <button
                      type="button"
                      onClick={toggleRecording}
                      disabled={inputTypingDisabled}
                      title={isRecording ? "Stop recording speech" : "Start recording speech"}
                      aria-label={isRecording ? "Stop recording speech" : "Start recording speech"}
                      className={cn(
                        "h-8 w-8 flex items-center justify-center rounded-lg transition-all border border-transparent hover:border-[var(--border-subtle)]",
                        isRecording 
                          ? "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20" 
                          : "text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)]"
                      )}
                    >
                      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
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
                      className="h-8 w-8 flex items-center justify-center rounded-full bg-[var(--accent)] text-white transition-all disabled:opacity-25 hover:scale-105 active:scale-95 shadow-none cursor-pointer"
                    >
                      {isStreaming ? <X className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {researchRequested && capabilities?.research_quota && (
                  <p className="pl-2 text-left text-[11px] text-[var(--text-dim)] mt-1.5">
                    Research mode is on · {capabilities.research_quota.remaining} searches remaining
                  </p>
                )}
              </div>

              {/* Quick Prompt Cards */}
              {!hasMessages && sessionReady && (
                <div className="flex flex-col space-y-1 w-full max-w-3xl mt-6">
                  {QUICK_PROMPTS.map(({ icon: Icon, label, desc, prompt }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                      className="group flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-[var(--bg-800)] border border-transparent hover:border-[var(--border-subtle)] transition-all text-left cursor-pointer bg-transparent"
                    >
                      <Icon className="h-4 w-4 text-[var(--text-dim)] group-hover:text-[var(--accent)] mt-0.5 shrink-0 transition-colors" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium text-[var(--text-primary)] mr-2">{label}</span>
                        <span className="text-[12px] text-[var(--text-dim)] leading-snug">— {desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

          </div>
        )}
      </div>
    </div>
  );
}
