"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  BrainCircuit,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Mic,
  MicOff,
  PenTool,
  Shield,
  FileText,
  ArrowUp,
  Bot,
  User,
  Check,
  Sparkles,
  Target,
  BookOpen,
} from "lucide-react";
import { getApiAuthHeaders } from "@/lib/api";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";

interface AIPlannerOverlayProps {
  teamId: string;
  /** "create" = new project; "manage" = update active project (requires projectId). */
  mode?: "create" | "manage";
  /** Required when mode is "manage". */
  projectId?: string | null;
  onClose: () => void;
  onPlanGenerated: (plan: { projectName: string; description: string; tasks: unknown[]; milestones: unknown[] }) => Promise<void> | void;
}

interface AgentStepEntry {
  name: string;
  label: string;
  status: "running" | "done" | "error";
  result?: Record<string, unknown>;
}

interface PlanResult {
  projectId?: string;
  projectName?: string;
  taskCount?: number;
  milestoneCount?: number;
  conflictCount?: number;
  risk?: { score: number; factors: string[]; suggestions: string[] };
  wikiPageUrl?: string;
  knowledgeGaps?: string[];
  critiqueScore?: number;
}

interface ChatMessage {
  id: string;
  sender: "user" | "architect";
  text?: string;
  isStreaming?: boolean;
  planningState?: {
    statusText: string;
    agentSteps: AgentStepEntry[];
    planResult?: PlanResult | null;
  };
}

const STEP_LABELS: Record<string, string> = {
  reasoning_decompose: "Decomposing mission into sub-goals",
  reasoning_research: "Researching wiki knowledge per sub-goal",
  reasoning_draft: "Drafting plan with reasoning traces",
  reasoning_critique: "Self-critiquing plan for issues",
  reasoning_finalize: "Inferring dependencies & scheduling",
  plan_generate_draft: "Generating plan draft",
  plan_search: "Searching plans & tasks",
  plan_read_entity: "Loading plan details",
  plan_create_project: "Creating project",
  plan_update_project: "Updating project",
  plan_update_task: "Updating task",
  plan_create_task: "Adding task",
  plan_create_milestone: "Adding milestone",
  plan_update_milestone: "Updating milestone",
  plan_detect_conflicts: "Detecting scheduling conflicts",
  plan_auto_resolve: "Auto-resolving conflicts",
  plan_risk_assessment: "Assessing timeline risk",
  plan_sync_wiki: "Syncing project to wiki",
  plan_check_overdue: "Checking for overdue items",
  wiki_search_pages: "Searching wiki",
  wiki_create_page: "Creating wiki page",
};

function getStepLabel(name: string, args?: string): string {
  const base = STEP_LABELS[name] || name.replace(/_/g, " ");
  if (name === "plan_create_task" && args) {
    try {
      const parsed = JSON.parse(args);
      if (parsed.index && parsed.total) return `Adding task ${parsed.index}/${parsed.total}`;
    } catch { /* ignore */ }
  }
  if (name === "plan_update_task" && args) {
    try {
      const parsed = JSON.parse(args);
      if (parsed.index && parsed.total) return `Updating task ${parsed.index}/${parsed.total}`;
    } catch { /* ignore */ }
  }
  if (name === "plan_create_milestone" && args) {
    try {
      const parsed = JSON.parse(args);
      if (parsed.index && parsed.total) return `Adding milestone ${parsed.index}/${parsed.total}`;
    } catch { /* ignore */ }
  }
  return base;
}

function riskColor(score: number): string {
  if (score <= 30) return "text-[var(--success)]";
  if (score <= 60) return "text-[var(--warning)]";
  return "text-[var(--danger)]";
}

function riskBg(score: number): string {
  if (score <= 30) return "bg-[var(--success-bg)]";
  if (score <= 60) return "bg-[var(--warning)]/10";
  return "bg-[var(--danger-bg)]";
}

export function AIPlannerOverlay({
  teamId,
  mode = "create",
  projectId = null,
  onClose,
  onPlanGenerated,
}: AIPlannerOverlayProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Manual Setup State
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  // Initialize introductory message
  useEffect(() => {
    const greetText = mode === "manage"
      ? "Hello! I am your AI Planner Architect. I have deep semantic access to your team's Wiki, active projects, team availability, and timeline risks. Ask me questions about active projects, request a complete project plan, or assign tasks!"
      : "Welcome to the AI Plan Architect! Let's build a new strategic project plan together. Tell me what you'd like to build, or suggest a mission!";
    
    setMessages([
      {
        id: "greet",
        sender: "architect",
        text: greetText,
      }
    ]);
  }, [mode]);

  // Scroll to bottom of chat
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const startVoiceMode = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInputText((prev) => prev + (prev ? " " : "") + finalTranscript);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;
    if (mode === "manage" && !projectId) {
      alert("No project is selected. Open a project and use AI Architect from the overview.");
      return;
    }

    setInputText("");
    setLoading(true);

    const userMsgId = Date.now().toString();
    setMessages((prev) => [...prev, { id: userMsgId, sender: "user", text }]);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        sender: "architect",
        text: "",
        isStreaming: true,
        planningState: { statusText: "Analyzing intent...", agentSteps: [], planResult: null }
      }
    ]);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
      const headers = {
        "Content-Type": "application/json",
        ...(await getApiAuthHeaders()),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamBody: Record<string, any> = { prompt: text, mode };
      if (mode === "manage" && projectId) {
        streamBody.project_id = projectId;
      }

      const response = await fetch(`${API_BASE}/planning/${teamId}/assist/stream/`, {
        method: "POST",
        headers,
        body: JSON.stringify(streamBody),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data:") && currentEvent) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== assistantMsgId) return msg;

                  // Handle QA Streaming Chat branch
                  if (currentEvent === "agent_chat_chunk") {
                    return {
                      ...msg,
                      text: (msg.text || "") + data.text,
                      planningState: undefined // Clear planning state since it's normal chat
                    };
                  }
                  if (currentEvent === "agent_chat_done") {
                    return { ...msg, isStreaming: false, planningState: undefined };
                  }

                  // Handle planning agent progress branch
                  const planState = msg.planningState || { statusText: "", agentSteps: [], planResult: null };

                  if (currentEvent === "agent_status") {
                    planState.statusText = data.status || "";
                  } else if (currentEvent === "agent_step") {
                    const name = data.name || "";
                    const label = getStepLabel(name, JSON.stringify(data.arguments || {}));
                    planState.agentSteps = [...planState.agentSteps, { name, label, status: "running" }];
                  } else if (currentEvent === "agent_result") {
                    const name = data.name || "";
                    planState.agentSteps = planState.agentSteps.map((step) =>
                      step.name === name && step.status === "running"
                        ? { ...step, status: data.ok ? "done" : "error", result: data.result }
                        : step
                    );
                  } else if (currentEvent === "reasoning_done") {
                    planState.statusText = "Reasoning complete. Creating project entities...";
                  } else if (currentEvent === "agent_done") {
                    planState.planResult = {
                      projectId: data.project_id,
                      projectName: data.project_name,
                      taskCount: data.task_count,
                      milestoneCount: data.milestone_count,
                      conflictCount: data.conflict_count,
                      risk: data.risk,
                      wikiPageUrl: data.wiki_page_url,
                      knowledgeGaps: data.knowledge_gaps,
                      critiqueScore: data.critique_score,
                    };
                    return { ...msg, isStreaming: false, planningState: planState };
                  } else if (currentEvent === "agent_error") {
                    throw new Error(data.detail || "Planning agent error");
                  }

                  return { ...msg, planningState: planState };
                })
              );
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.startsWith("Planning agent error")) throw parseErr;
            }
            currentEvent = "";
          }
        }
      }

      // Cleanup streaming flag if complete
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg))
      );
    } catch (error) {
      const err = error as Error;
      console.error(err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, isStreaming: false, text: `⚠️ Error: ${err?.message || "Failed to communicate with AI Architect."}` }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualName.trim()) return;
    setLoading(true);
    try {
      await onPlanGenerated({
        projectName: manualName,
        description: manualDesc,
        tasks: [],
        milestones: [],
      });
    } finally {
      setLoading(false);
    }
  };

  /* Derive the latest planning state from the last architect message */
  const latestPlanState = [...messages].reverse().find(m => m.sender === "architect" && m.planningState)?.planningState ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-5xl bg-[var(--surface-1)] rounded-[28px] overflow-hidden flex flex-col h-[90vh] shadow-2xl border border-[var(--border-subtle)]"
      >
        {/* ── Header ── */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-900)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 opacity-30 blur-lg scale-110" />
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center shadow-[var(--shadow-glow)]">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                AI Planner Architect
                <span className="text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20">
                  {mode === "manage" ? "Manage" : "Create"}
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Multi-agent scheduling & strategy co-pilot</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualMode(!isManualMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all bg-[var(--bg-800)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
            >
              <PenTool className="w-3.5 h-3.5" />
              {isManualMode ? "AI Chat" : "Manual"}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[var(--bg-700)] rounded-xl transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <div className="flex-1 overflow-hidden flex">
          <AnimatePresence mode="wait">
            {isManualMode ? (
              /* Manual Setup */
              <motion.div
                key="manual"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 p-8 overflow-y-auto"
              >
                <div className="max-w-xl mx-auto space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Project Name</label>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Enter project name..."
                      className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Description</label>
                    <textarea
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      placeholder="Optional details..."
                      className="w-full h-32 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 transition-all resize-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsManualMode(false)} className="flex-1 h-12 rounded-2xl bg-[var(--surface-2)] text-[var(--text-secondary)] font-semibold border border-[var(--border-subtle)] transition-all hover:bg-[var(--surface-3)]">
                      Back to AI Chat
                    </button>
                    <button
                      onClick={handleManualSubmit}
                      disabled={!manualName.trim() || loading}
                      className="flex-[2] h-12 bg-[var(--accent)] text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Create Blank Project</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Two-panel AI Chat layout */
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden"
              >
                {/* ── Left: Chat messages ── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.sender === "architect" && (
                          <div className="relative shrink-0 mt-0.5">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 opacity-20 blur-md" />
                            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center shadow-md">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                        <div className="max-w-[80%]">
                          {(msg.text || msg.isStreaming) && (
                            <div className={`${
                              msg.sender === "user"
                                ? "px-4 py-3 rounded-2xl rounded-br-sm bg-gradient-to-br from-[var(--accent)] to-purple-600 text-white text-[14px] leading-relaxed shadow-[var(--shadow-md)]"
                                : "text-[var(--text-primary)] text-[14px] leading-relaxed"
                            }`}>
                              {msg.sender === "architect" ? (
                                msg.text
                                  ? <ChatMessageContent content={msg.text} streaming={!!msg.isStreaming} />
                                  : <span className="flex items-center gap-2 text-[var(--text-muted)] py-1">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                                      <span className="text-[12px]">Architect is thinking…</span>
                                    </span>
                              ) : (
                                msg.text
                              )}
                            </div>
                          )}
                        </div>
                        {msg.sender === "user" && (
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-700)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                            <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Suggested starters */}
                  {messages.length === 1 && (
                    <div className="px-5 pb-3 flex flex-col gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)] mb-1">Try asking</p>
                      {[
                        { icon: Sparkles, text: "Create a marketing launch strategy for our KYC feature" },
                        { icon: Target,   text: "Analyze our team timeline risks and draft a mitigation roadmap" },
                        { icon: BookOpen, text: "List our active wiki pages and suggest strategic updates" },
                      ].map(({ icon: Icon, text }, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(text)}
                          className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--bg-900)] hover:bg-[var(--bg-800)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-left transition-all border border-[var(--border-subtle)] hover:border-[var(--accent)]/30 text-[12px] group"
                        >
                          <Icon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          {text}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input bar */}
                  <div className="shrink-0 px-4 pb-4 pt-3 border-t border-[var(--border-subtle)] bg-[var(--bg-900)]">
                    <div className="flex items-end gap-2">
                      <button
                        onClick={startVoiceMode}
                        className={`p-2.5 rounded-full transition-all shrink-0 mb-0.5 ${isListening ? "bg-[var(--danger)] text-white animate-pulse" : "bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]"}`}
                      >
                        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      <div className="relative flex-1">
                        <textarea
                          value={inputText}
                          onChange={(e) => {
                            setInputText(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
                          }}
                          rows={1}
                          placeholder="Ask a question or describe a strategic plan…"
                          className="w-full bg-[var(--bg-800)] border border-[var(--border-strong)] rounded-2xl py-4 pl-5 pr-14 text-[var(--text-primary)] text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/15 focus:border-[var(--accent)]/60 resize-none overflow-hidden leading-relaxed transition-all shadow-[var(--shadow-sm)] placeholder:text-[var(--text-dim)]"
                          style={{ maxHeight: "120px" }}
                        />
                        <button
                          onClick={() => void handleSend()}
                          disabled={!inputText.trim() || loading}
                          className="absolute right-3 bottom-3 h-10 w-10 flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-purple-600 text-white transition-all disabled:opacity-25 hover:shadow-[var(--shadow-glow)] hover:scale-105 active:scale-95 shadow-[var(--shadow-sm)]"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Right: Live Execution Panel ── */}
                <div className="w-72 shrink-0 border-l border-[var(--border-subtle)] flex flex-col bg-[var(--bg-950)]/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-[var(--accent)] animate-pulse" : latestPlanState?.planResult ? "bg-[var(--success)]" : "bg-[var(--border-strong)]"}`} />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                        {loading ? "Executing" : latestPlanState?.planResult ? "Completed" : "Execution Panel"}
                      </span>
                    </div>
                    {latestPlanState?.statusText && (
                      <p className="text-[11px] text-[var(--accent)] mt-1 font-medium leading-snug">
                        {latestPlanState.statusText}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Step rail */}
                    {latestPlanState && latestPlanState.agentSteps.length > 0 && (
                      <div className="px-4 py-3 space-y-0">
                        {latestPlanState.agentSteps.map((step, idx) => {
                          const isDone = step.status === "done";
                          const isErr = step.status === "error";
                          const isRunning = step.status === "running";
                          const isLast = idx === latestPlanState.agentSteps.length - 1;
                          return (
                            <motion.div
                              key={`exec-step-${idx}`}
                              initial={{ opacity: 0, x: 8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.03 }}
                              className="flex gap-3"
                            >
                              <div className="flex flex-col items-center">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300 ${
                                  isDone    ? "bg-[var(--success-bg)] border-[var(--success)] text-[var(--success)]" :
                                  isErr     ? "bg-[var(--danger-bg)] border-[var(--danger)] text-[var(--danger)]" :
                                  isRunning ? "bg-[var(--surface-2)] border-[var(--accent)] text-[var(--accent)]" :
                                              "bg-[var(--surface-2)] border-[var(--border-strong)] text-[var(--text-dim)]"
                                }`}>
                                  {isDone    && <Check className="w-2.5 h-2.5" />}
                                  {isErr     && <AlertCircle className="w-2.5 h-2.5" />}
                                  {isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                </div>
                                {!isLast && <div className="w-[2px] flex-1 min-h-[16px] bg-[var(--border-subtle)] mt-0.5" />}
                              </div>
                              <div className={`pb-3 pt-0.5 text-[11px] leading-tight ${
                                isDone    ? "text-[var(--text-muted)]" :
                                isErr     ? "text-[var(--danger)]" :
                                isRunning ? "text-[var(--text-primary)] font-semibold" :
                                            "text-[var(--text-dim)]"
                              }`}>
                                {step.label}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {/* Plan result card */}
                    {latestPlanState?.planResult && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="px-4 pb-4 space-y-4"
                      >
                        <div className="pt-1 pb-3 border-b border-[var(--border-subtle)]">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                            <span className="text-[13px] font-bold text-[var(--text-primary)] leading-tight">
                              {latestPlanState.planResult.projectName || "Plan Created"}
                            </span>
                          </div>
                          {latestPlanState.planResult.wikiPageUrl && (
                            <a href={latestPlanState.planResult.wikiPageUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 mt-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] hover:underline">
                              <FileText className="w-3 h-3" /> View Wiki Brief
                            </a>
                          )}
                        </div>

                        {/* 4-stat grid */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: "Tasks",      value: latestPlanState.planResult.taskCount ?? 0,      color: "" },
                            { label: "Milestones", value: latestPlanState.planResult.milestoneCount ?? 0, color: "" },
                            { label: "Conflicts",  value: latestPlanState.planResult.conflictCount ?? 0,  color: (latestPlanState.planResult.conflictCount ?? 0) > 0 ? "text-[var(--warning)]" : "" },
                            { label: "Critique",   value: latestPlanState.planResult.critiqueScore != null ? `${latestPlanState.planResult.critiqueScore}/10` : "—", color: "" },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-[var(--surface-1)] rounded-xl p-2.5 text-center border border-[var(--border-subtle)]">
                              <div className={`text-lg font-black text-[var(--text-primary)] ${color}`}>{value}</div>
                              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">{label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Risk meter */}
                        {latestPlanState.planResult.risk && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Risk Score</span>
                              <span className={`text-[11px] font-bold ${riskColor(latestPlanState.planResult.risk.score)}`}>
                                {latestPlanState.planResult.risk.score}/100
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  latestPlanState.planResult.risk.score <= 30 ? "bg-[var(--success)]" :
                                  latestPlanState.planResult.risk.score <= 60 ? "bg-[var(--warning)]" : "bg-[var(--danger)]"
                                }`}
                                style={{ width: `${latestPlanState.planResult.risk.score}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Risk mitigations */}
                        {latestPlanState.planResult.risk?.suggestions && latestPlanState.planResult.risk.suggestions.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Mitigations</p>
                            {latestPlanState.planResult.risk.suggestions.slice(0, 3).map((s, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                                <Shield className="w-3 h-3 shrink-0 mt-0.5 text-[var(--accent)]" />
                                {s}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Knowledge gaps */}
                        {latestPlanState.planResult.knowledgeGaps && latestPlanState.planResult.knowledgeGaps.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Knowledge Gaps</p>
                            {latestPlanState.planResult.knowledgeGaps.slice(0, 3).map((gap, i) => (
                              <div key={i} className="text-[11px] text-[var(--warning)] bg-[var(--warning)]/5 rounded-lg px-2.5 py-1.5 border border-[var(--warning)]/10">
                                {gap}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* CTA */}
                        <button
                          onClick={() => {
                            onPlanGenerated({
                              projectName: latestPlanState.planResult?.projectName || "AI Plan",
                              description: `${latestPlanState.planResult?.taskCount ?? 0} tasks · ${latestPlanState.planResult?.milestoneCount ?? 0} milestones`,
                              tasks: [],
                              milestones: [],
                            });
                          }}
                          className="w-full h-10 bg-[var(--accent)] text-white text-[12px] font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-md"
                        >
                          Open Project
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    )}

                    {/* Empty state for right panel */}
                    {!latestPlanState && !loading && (
                      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4 py-8">
                        <div className="relative">
                          <div className="absolute inset-0 rounded-2xl bg-[var(--accent)]/10 blur-xl scale-150" />
                          <div className="relative w-14 h-14 rounded-2xl bg-[var(--bg-800)] border border-[var(--border-subtle)] flex items-center justify-center">
                            <BrainCircuit className="w-7 h-7 text-[var(--text-dim)]" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[12px] font-semibold text-[var(--text-secondary)]">Execution Panel</p>
                          <p className="text-[11px] text-[var(--text-dim)] leading-relaxed">
                            Agent steps and plan results appear here in real time.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
