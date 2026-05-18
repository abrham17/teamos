"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  BrainCircuit,
  Loader2,
  ArrowRight,
  PenTool,
  Send,
  Bot,
  User
} from "lucide-react";
import { getApiAuthHeaders } from "@/lib/api";
import ReactMarkdown from "react-markdown";

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
  chat_load_context: "Loading project context",
  chat_wiki_search: "Searching knowledge base",
  chat_generate: "Generating response",
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
                    const pName = String(data.project_name || "Project");
                    const tCount = Number(data.task_count ?? 0);
                    const mCount = Number(data.milestone_count ?? 0);
                    const cCount = Number(data.conflict_count ?? 0);
                    const rScore = (data.risk as { score?: number } | undefined)?.score ?? 0;
                    const summaryParts: string[] = [
                      `**${tCount}** task${tCount !== 1 ? "s" : ""}`,
                      `**${mCount}** milestone${mCount !== 1 ? "s" : ""}`,
                      `risk score **${rScore}/100**`,
                    ];
                    if (cCount > 0) summaryParts.push(`**${cCount}** conflict${cCount !== 1 ? "s" : ""} detected`);
                    const summaryText = `✅ **${pName}** created — ${summaryParts.join(", ")}. Check the execution panel for the full breakdown.`;
                    return { ...msg, isStreaming: false, text: summaryText, planningState: planState };
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



  const renderPlannerInput = () => {
    return (
      <motion.div
        layoutId="planner-chat-input"
        className="w-full relative flex flex-col gap-2 z-20"
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        <div className="relative group w-full">
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
            className="w-full bg-[var(--bg-950)] border border-[var(--border-strong)] py-3 pl-4 pr-16 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/50 shadow-none resize-none overflow-hidden leading-relaxed"
            style={{ maxHeight: "120px" }}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              onClick={() => void handleSend()}
              disabled={!inputText.trim() || loading}
              className="h-9 w-9 bg-[var(--accent)] disabled:opacity-40 text-[var(--bg-950)] flex items-center justify-center transition-colors shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

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
        <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-2)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center shadow-md">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                AI Planner Architect
                <span className="text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                  {mode === "manage" ? "Manage" : "Create"}
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">Multi-agent scheduling & strategy co-pilot</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualMode(!isManualMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all bg-[var(--surface-3)] border border-[var(--border-subtle)]"
            >
              <PenTool className="w-3 h-3" />
              {isManualMode ? "AI Chat" : "Manual"}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[var(--surface-3)] rounded-xl transition-colors">
              <X className="w-4.5 h-4.5 text-[var(--text-muted)]" />
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
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden"
              >
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.sender === "architect" && (
                          <div className="w-8 h-8 bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="w-4 h-4 text-[var(--text-primary)]" />
                          </div>
                        )}
                        <div className="max-w-[78%]">
                          {(msg.text || msg.isStreaming) && (
                            <div className={`px-4 py-3 text-sm leading-relaxed ${
                              msg.sender === "user"
                                ? "bg-[var(--accent)] text-white font-medium"
                                : "bg-transparent text-[var(--text-primary)] border-none px-0"
                            }`}>
                              {msg.sender === "architect" && msg.text ? (
                                <div className="prose prose-sm prose-invert max-w-none text-[var(--text-primary)] [&_strong]:text-[var(--text-primary)] [&_a]:text-[var(--accent)]">
                                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                                  {msg.planningState?.planResult && (
                                    <button
                                      onClick={() => {
                                        onPlanGenerated({
                                          projectName: msg.planningState?.planResult?.projectName || "AI Plan",
                                          description: `${msg.planningState?.planResult?.taskCount ?? 0} tasks · ${msg.planningState?.planResult?.milestoneCount ?? 0} milestones`,
                                          tasks: [],
                                          milestones: [],
                                        });
                                      }}
                                      className="mt-4 w-full h-10 bg-[var(--accent)] text-[var(--bg-950)] text-[12px] font-bold flex items-center justify-center gap-2 transition-colors"
                                    >
                                      Open Project
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ) : msg.text ? (
                                msg.text
                              ) : (
                                <span className="flex items-center gap-2 text-[var(--text-muted)]">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                                  <span className="text-[12px]">Architect is thinking…</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {msg.sender === "user" && (
                          <div className="w-8 h-8 bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                            <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {messages.length === 1 && (
                    <div className="px-5 pb-3 flex flex-wrap gap-2 justify-center">
                      {[
                        "Create a marketing launch strategy for our KYC feature",
                        "Analyze our team timeline risks and draft a mitigation roadmap",
                        "List our active wiki pages and suggest strategic updates",
                      ].map((starter, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(starter)}
                          className="text-[11px] px-3 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] text-left transition-colors border border-[var(--border-subtle)]"
                        >
                          {starter}
                        </button>
                      ))}
                    </div>
                  )}

                  {messages.length === 1 ? (
                    <div className="px-6 pb-6 pt-2 w-full max-w-2xl mx-auto">
                      {renderPlannerInput()}
                    </div>
                  ) : (
                    <div className="shrink-0 px-4 pb-4 pt-2 border-t border-[var(--border-subtle)] bg-[var(--bg-950)] w-full">
                      {renderPlannerInput()}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
