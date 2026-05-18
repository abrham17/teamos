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
  Send,
  Bot,
  User,
  Check
} from "lucide-react";
import { getApiAuthHeaders } from "@/lib/api";

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-[var(--surface-1)] rounded-[32px] overflow-hidden flex flex-col h-[85vh] shadow-2xl border border-[var(--border-subtle)]"
      >
        {/* Header */}
        <header className="p-6 pb-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
              <BrainCircuit className="w-7 h-7 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                AI Planner Architect
                <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                  {mode === "manage" ? "Manage Mode" : "Create Mode"}
                </span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Cooperative Multi-Agent Scheduling & Strategy Co-pilot
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualMode(!isManualMode)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all bg-[var(--surface-3)] shadow-sm"
            >
              <PenTool className="w-3 h-3" />
              {isManualMode ? "AI Chat" : "Manual Setup"}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--bg-700)] rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[var(--bg-950)]/50 relative">
          <AnimatePresence mode="wait">
            {isManualMode ? (
              /* Manual Setup Mode */
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 p-8 space-y-6 overflow-y-auto"
              >
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Enter project name..."
                      className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Description
                    </label>
                    <textarea
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      placeholder="Optional details..."
                      className="w-full h-36 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all resize-none shadow-inner"
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button
                      onClick={() => setIsManualMode(false)}
                      className="flex-1 h-14 rounded-2xl bg-[var(--surface-2)] text-[var(--text-secondary)] font-bold transition-all border border-[var(--border-subtle)]"
                    >
                      Back to AI Chat
                    </button>
                    <button
                      onClick={handleManualSubmit}
                      disabled={!manualName.trim() || loading}
                      className="flex-[2] h-14 bg-[var(--accent)] text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 disabled:opacity-50 transition-all shadow-xl shadow-[var(--accent-glow)]"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Blank Project"}
                      {!loading && <ArrowRight className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Conversational AI Chat Mode */
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {/* Message list */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-4 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.sender === "architect" && (
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)]/20 border border-[var(--accent)]/10 flex items-center justify-center shrink-0">
                          <Bot className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                      )}
                      <div className="space-y-3 max-w-[80%]">
                        {/* Text Message Bubble */}
                        {(msg.text || msg.isStreaming) && (
                          <div className={`p-4 rounded-2xl leading-relaxed text-sm ${
                            msg.sender === "user"
                              ? "bg-[var(--accent)] text-white shadow-md rounded-tr-none"
                              : "bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-tl-none"
                          }`}>
                            {msg.text || (
                              <span className="flex items-center gap-2 text-[var(--text-muted)] animate-pulse">
                                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                                Architect is typing...
                              </span>
                            )}
                          </div>
                        )}

                        {/* Inline Planning Steps / Results Bubble */}
                        {msg.planningState && (
                          <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4 rounded-tl-none shadow-md">
                            {/* Header Status */}
                            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                              <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                {msg.planningState.statusText || "Agent executing..."}
                              </span>
                              <span className="text-[10px] font-mono text-[var(--text-dim)]">
                                {msg.planningState.agentSteps.filter((s) => s.status === "done").length}/{msg.planningState.agentSteps.length} Steps
                              </span>
                            </div>

                            {/* Live Steps Sequence */}
                            {msg.planningState.agentSteps.length > 0 && (
                              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {msg.planningState.agentSteps.map((step, idx) => (
                                  <div key={idx} className="flex items-center gap-2.5 text-xs">
                                    <div className={`
                                      w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 border transition-all
                                      ${step.status === "done" ? "bg-[var(--success-bg)] border-[var(--success)]/30 text-[var(--success)]" :
                                        step.status === "error" ? "bg-[var(--danger-bg)] border-[var(--danger)]/30 text-[var(--danger)]" :
                                        "bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-muted)]"}
                                    `}>
                                      {step.status === "done" && <Check className="w-2.5 h-2.5" />}
                                      {step.status === "error" && <AlertCircle className="w-2.5 h-2.5" />}
                                      {step.status === "running" && <Loader2 className="w-2.5 h-2.5 animate-spin text-[var(--accent)]" />}
                                    </div>
                                    <span className={step.status === "running" ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                                      {step.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Plan Results Dashboard */}
                            {msg.planningState.planResult && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-4 pt-3 border-t border-[var(--border-subtle)]"
                              >
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
                                    {msg.planningState.planResult.projectName || "Plan Created"}
                                  </h4>
                                  {msg.planningState.planResult.wikiPageUrl && (
                                    <a href={msg.planningState.planResult.wikiPageUrl} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] hover:underline">
                                      <FileText className="w-3 h-3" /> Wiki Brief
                                    </a>
                                  )}
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-[var(--bg-950)] rounded-xl p-2.5 text-center border border-[var(--border-subtle)]">
                                    <div className="text-xl font-black text-[var(--text-primary)]">{msg.planningState.planResult.taskCount ?? 0}</div>
                                    <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Tasks</div>
                                  </div>
                                  <div className="bg-[var(--bg-950)] rounded-xl p-2.5 text-center border border-[var(--border-subtle)]">
                                    <div className="text-xl font-black text-[var(--text-primary)]">{msg.planningState.planResult.milestoneCount ?? 0}</div>
                                    <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Milestones</div>
                                  </div>
                                  <div className={`rounded-xl p-2.5 text-center border border-[var(--border-subtle)] ${msg.planningState.planResult.risk ? riskBg(msg.planningState.planResult.risk.score) : "bg-[var(--bg-950)]"}`}>
                                    <div className={`text-xl font-black ${msg.planningState.planResult.risk ? riskColor(msg.planningState.planResult.risk.score) : "text-[var(--text-primary)]"}`}>
                                      {msg.planningState.planResult.risk?.score ?? "—"}
                                    </div>
                                    <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Risk Score</div>
                                  </div>
                                </div>

                                {msg.planningState.planResult.risk?.suggestions && msg.planningState.planResult.risk.suggestions.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Risk Mitigations</p>
                                    {msg.planningState.planResult.risk.suggestions.slice(0, 2).map((s, i) => (
                                      <div key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]">
                                        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--accent)]" />
                                        {s}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="pt-2">
                                  <button
                                    onClick={() => {
                                      onPlanGenerated({
                                        projectName: msg.planningState?.planResult?.projectName || "AI Plan",
                                        description: `${msg.planningState?.planResult?.taskCount ?? 0} tasks · ${msg.planningState?.planResult?.milestoneCount ?? 0} milestones`,
                                        tasks: [],
                                        milestones: [],
                                      });
                                    }}
                                    className="w-full h-11 bg-[var(--accent)] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-md"
                                  >
                                    Open Generated Project Plan
                                    <ArrowRight className="w-4 h-4" />
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        )}
                      </div>
                      {msg.sender === "user" && (
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Suggestions / Starters list */}
                {messages.length === 1 && (
                  <div className="p-6 pt-0 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Suggested Starters
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Create a marketing launch strategy for our KYC feature",
                        "Analyze our team timeline risks and draft a mitigation roadmap",
                        "List our active wiki pages and suggest strategic updates"
                      ].map((starter, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(starter)}
                          className="text-[11px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] text-left transition-all border border-[var(--border-subtle)] active:scale-98 shadow-sm max-w-md block"
                        >
                          {starter}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat Input Box */}
                <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-2)] flex items-end gap-3">
                  <button
                    onClick={startVoiceMode}
                    className={`p-3.5 rounded-xl transition-all ${
                      isListening
                        ? "bg-[var(--danger)] text-white animate-pulse"
                        : "bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 relative">
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Ask a question or request a strategic plan..."
                      className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 pr-12 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none h-12 max-h-24 shadow-inner"
                    />
                  </div>
                  <button
                    onClick={() => handleSend()}
                    disabled={!inputText.trim() || loading}
                    className="p-3.5 bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white rounded-xl transition-all shadow-md"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
