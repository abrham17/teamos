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
  onPlanGenerated: (plan: {
    projectName: string;
    description: string;
    tasks: unknown[];
    milestones: unknown[];
  }) => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "architect";
  text: string;
  isStreaming?: boolean;
  planningState?: {
    statusText: string;
    agentSteps: Array<{ name: string; label: string; status: "running" | "done" | "error"; result?: unknown }>;
    planResult: {
      projectId?: string;
      projectName?: string;
      taskCount?: number;
      milestoneCount?: number;
      conflictCount?: number;
      risk?: unknown;
      wikiPageUrl?: string;
      knowledgeGaps?: string[];
      critiqueScore?: number;
    } | null;
  };
}

const STEP_LABELS: Record<string, string> = {
  reasoning_research: "Doing deep semantic RAG research",
  reasoning_synthesize: "Synthesizing constraints and goals",
  reasoning_decompose: "Decomposing into micro-tasks",
  reasoning_draft: "Drafting timeline milestones",
  reasoning_critique: "Evaluating plan risks and quality",
  reasoning_finalize: "Finalizing and scheduling tasks",
  plan_create_project: "Creating project record",
  plan_update_project: "Updating project parameters",
  plan_create_task: "Creating calendar tasks",
  plan_update_task: "Updating task specs",
  plan_create_milestone: "Creating project milestone",
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
                    
                    const summaryText = `🏗️ **Project Plan Generated Successfully**\n\n* **Project Name**: ${pName}\n* **Deliverables**: ${tCount} tasks · ${mCount} milestones\n* **Risk Index**: ${rScore}/100${cCount > 0 ? ` · ${cCount} schedule conflict(s) detected` : ""}\n\nClick below to open the interactive roadmap interface and assign team members.`;
                    
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

  const isInitialState = messages.length <= 1;

  const renderPlannerInput = () => {
    return (
      <div className="shrink-0 p-4 border-t border-[var(--border-subtle)] flex flex-col bg-[var(--chat-page-bg)]">
        <div className="relative flex items-end bg-[var(--surface-1)] border border-[var(--border-subtle)] focus-within:border-[var(--border-hover)] transition-colors p-2">
          <textarea
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
            }}
            rows={1}
            placeholder="Ask a question or describe a strategic plan…"
            className="flex-1 bg-transparent px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none resize-none overflow-hidden leading-relaxed pb-8 min-h-[44px]"
            style={{ maxHeight: "140px" }}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
            <button
              onClick={() => void handleSend()}
              disabled={!inputText.trim() || loading}
              className="h-8 px-3.5 bg-[var(--chat-accent)] hover:opacity-90 disabled:opacity-30 text-white text-[12px] font-medium flex items-center justify-center gap-1.5 transition-all"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Send <Send className="w-3 h-3" /></>}
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-[var(--text-dim)] mt-2">TeamOS Planning Intelligence · Shift+Enter for newline</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-[var(--chat-page-bg)] overflow-hidden flex flex-col h-[88vh] border border-[var(--border-subtle)]"
      >
        {/* Header */}
        <header className="px-5 py-3.5 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0 bg-[var(--chat-page-bg)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border border-[var(--border-subtle)] flex items-center justify-center bg-[var(--surface-1)]">
              <BrainCircuit className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                AI Architect
                <span className="text-[9px] font-semibold tracking-wider px-2 py-0.5 border border-[var(--border-strong)] text-[var(--text-muted)] bg-[var(--surface-1)]">
                  {mode === "manage" ? "Manage" : "Create"}
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">Multi-agent scheduling & strategy co-pilot</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualMode(!isManualMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all border border-[var(--border-subtle)] bg-[var(--surface-1)]"
            >
              <PenTool className="w-3 h-3" />
              {isManualMode ? "AI Chat" : "Manual Plan"}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface-1)] transition-colors border border-transparent">
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex bg-[var(--chat-page-bg)]">
          <AnimatePresence mode="wait">
            {isManualMode ? (
              /* Manual Mode Form */
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex-1 p-8 overflow-y-auto"
              >
                <div className="max-w-md mx-auto space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Project Name</label>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Enter project name..."
                      className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] p-4 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)] transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Description</label>
                    <textarea
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      placeholder="Describe core project metrics..."
                      className="w-full h-32 bg-[var(--surface-1)] border border-[var(--border-subtle)] p-4 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)] transition-all resize-none text-sm leading-relaxed"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsManualMode(false)} className="flex-1 h-11 border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium transition-all hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] text-sm">
                      Cancel
                    </button>
                    <button
                      onClick={handleManualSubmit}
                      disabled={!manualName.trim() || loading}
                      className="flex-[2] h-11 bg-[var(--chat-accent)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all text-sm"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Create Workspace</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Single-column AI Chat */
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col overflow-hidden min-w-0"
              >
                {isInitialState ? (
                  /* Center Greeting empty state */
                  <div className="flex-1 flex flex-col justify-between overflow-y-auto custom-scrollbar">
                    <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-xl mx-auto text-center gap-6">
                      <div className="w-12 h-12 border border-[var(--border-subtle)] flex items-center justify-center bg-[var(--surface-1)]">
                        <BrainCircuit className="w-6 h-6 text-[var(--accent)] animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-[16px] font-bold text-[var(--text-primary)]">What are we building today?</h3>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          {messages[0]?.text || "Hello! I am your AI Planner Architect. Let's design a strategic project timeline, assign specialists, and resolve potential conflicts."}
                        </p>
                      </div>

                      {/* Suggestions list */}
                      <div className="w-full grid grid-cols-1 gap-2 pt-2">
                        {[
                          "Create a product marketing launch strategy for our new KYC service",
                          "Analyze current team timeline risks and draft a strategic roadmap",
                          "List our active wiki pages and outline project requirements",
                        ].map((starter, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(starter)}
                            className="text-[12px] p-3 text-left transition-all border border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] flex items-center justify-between group"
                          >
                            <span className="truncate pr-4">{starter}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Animated Chat Prompt Container inside empty state */}
                    <motion.div layoutId="planner-chat-input">
                      {renderPlannerInput()}
                    </motion.div>
                  </div>
                ) : (
                  /* Message Feed and bottom chat bar */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                      {messages.map((msg) => (
                        <div key={msg.id} className="flex gap-3 justify-start max-w-3xl mx-auto w-full">
                          <div className="w-8 h-8 border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5 bg-[var(--surface-1)]">
                            {msg.sender === "user" ? (
                              <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            ) : (
                              <Bot className="w-4 h-4 text-[var(--text-muted)]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-1">
                              {msg.sender === "user" ? "USER" : "AI ARCHITECT"}
                            </p>
                            <div className="text-sm leading-relaxed text-[var(--text-primary)]">
                              {msg.sender === "architect" && msg.text ? (
                                <div className="prose prose-sm prose-invert max-w-none text-[var(--text-primary)] [&_strong]:text-[var(--text-primary)] [&_a]:text-[var(--chat-accent)] border-none px-0">
                                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                                  
                                  {/* Streaming execution steps inline */}
                                  {msg.planningState && (
                                    <div className="mt-4 border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 space-y-3">
                                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                                          {msg.isStreaming ? "Thinking..." : "Execution Complete"}
                                        </span>
                                        <span className="text-[11px] text-[var(--accent)] font-medium">
                                          {msg.planningState.statusText}
                                        </span>
                                      </div>
                                      
                                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                        {msg.planningState.agentSteps.map((step, idx) => (
                                          <div key={idx} className="flex items-center justify-between text-[11px] py-1 border-b border-[var(--border-subtle)]/50 last:border-0">
                                            <span className="text-[var(--text-secondary)]">{step.label}</span>
                                            <span className={`font-semibold ${step.status === "done" ? "text-[var(--success)]" : step.status === "error" ? "text-[var(--danger)]" : "text-[var(--accent)] animate-pulse"}`}>
                                              {step.status === "done" ? "Done" : step.status === "error" ? "Error" : "Running"}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Inline Open Project Action CTA */}
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
                                      className="mt-4 w-full h-10 bg-[var(--chat-accent)] text-white text-[12px] font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                                    >
                                      Open Project
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ) : msg.text ? (
                                msg.text
                              ) : (
                                <span className="flex items-center gap-1.5 py-1">
                                  {[0, 1, 2].map(i => (
                                    <span
                                      key={i}
                                      className="w-1.5 h-1.5 rounded-full bg-[var(--text-dim)] animate-bounce inline-block"
                                      style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1s" }}
                                    />
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    
                    {/* Animated Chat Prompt Container at bottom */}
                    <motion.div layoutId="planner-chat-input">
                      {renderPlannerInput()}
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
