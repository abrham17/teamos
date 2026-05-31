"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  BrainCircuit,
  Loader2,
  PenTool,
  ArrowRight,
} from "lucide-react";
import { getApiAuthHeaders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PlanReviewPanel, type ReviewMutation, type ReviewPlanPreview } from "@/components/chat/PlanReviewPanel";
import {
  ChatMessageList,
  InputBar,
  LandingView,
  type ChatMessage,
  type PlanResult,
  clonePlanningState,
  buildPlanSummary,
  getStepLabel,
  processSseLines,
  appendActivityEntry,
  completeLastActivityEntry,
} from "./ai-architect";

interface AIPlannerOverlayProps {
  teamId: string;
  mode?: "create" | "manage";
  projectId?: string | null;
  onClose: () => void;
  onPlanGenerated: (plan: { projectName: string; description: string; tasks: unknown[]; milestones: unknown[] }) => Promise<void> | void;
}

function applyArchitectStreamEvent(
  msg: ChatMessage,
  event: string,
  data: Record<string, unknown>
): ChatMessage {
  if (event === "thinking") {
    const thinkingContent = typeof data.content === "string" ? data.content : "";
    const planState = msg.planningState
      ? clonePlanningState(msg.planningState)
      : { statusText: "", agentSteps: [], planResult: null, activityFeed: [] };

    return {
      ...msg,
      reasoningText: `${msg.reasoningText ?? ""}${thinkingContent}`,
      planningState: planState,
      isStreaming: true,
    };
  }
  if (event === "agent_chat_chunk") {
    return {
      ...msg,
      text: `${msg.text ?? ""}${typeof data.text === "string" ? data.text : ""}`,
      planningState: undefined,
      isStreaming: true,
    };
  }
  if (event === "agent_chat_done") {
    return { ...msg, isStreaming: false, planningState: undefined };
  }

  const planState = clonePlanningState(
    msg.planningState ?? { statusText: "", agentSteps: [], planResult: null, activityFeed: [] }
  );
  if (!planState.activityFeed) planState.activityFeed = [];

  let text = msg.text ?? "";

  if (event === "ask_user") {
    return {
      ...msg,
      isStreaming: false,
      planningState: undefined,
      question: {
        question: typeof data.question === "string" ? data.question : "Can you share more details?",
        options: Array.isArray(data.options)
          ? (data.options as string[])
          : undefined,
      },
    };
  }

  if (event === "agent_activity") {
    const kind = (typeof data.kind === "string" ? data.kind : "status") as "status" | "thinking" | "tool";
    const message = typeof data.message === "string" ? data.message : "";
    const status = (typeof data.status === "string" ? data.status : "running") as "running" | "done" | "error";
    const detail = data.detail as Record<string, unknown> | undefined;

    if (message) {
      planState.activityFeed = appendActivityEntry(planState.activityFeed, kind, message, status, detail);
    }
  } else if (event === "agent_status") {
    planState.statusText = typeof data.status === "string" ? data.status : "";
    // Also add to activity feed as a status entry
    if (planState.statusText) {
      planState.activityFeed = appendActivityEntry(planState.activityFeed, "status", planState.statusText, "running");
    }
  } else if (event === "agent_step") {
    const name = typeof data.name === "string" ? data.name : "";
    const label = getStepLabel(name, JSON.stringify(data.arguments || {}));
    planState.agentSteps = [...planState.agentSteps, { name, label, status: "running" }];
  } else if (event === "agent_result") {
    const name = typeof data.name === "string" ? data.name : "";
    planState.agentSteps = planState.agentSteps.map((step) =>
      step.name === name && step.status === "running"
        ? {
            ...step,
            status: data.ok ? "done" : "error",
            result: (data.result as Record<string, unknown> | undefined) ?? step.result,
          }
        : step
    );
    // Complete the last running activity entry
    planState.activityFeed = completeLastActivityEntry(
      planState.activityFeed,
      undefined,
      data.ok ? "done" : "error",
      (data.result as Record<string, unknown> | undefined)
    );
  } else if (event === "reasoning_done") {
    planState.statusText = "Plan reasoning complete.";
    const summary = buildPlanSummary(data);
    if (summary) text = summary;
    planState.activityFeed = completeLastActivityEntry(planState.activityFeed, "Reasoning complete", "done");
    return { ...msg, text, isStreaming: false, planningState: planState };
  } else if (event === "agent_done") {
    const summary = buildPlanSummary(data);
    if (summary) text = summary;
    planState.activityFeed = completeLastActivityEntry(planState.activityFeed, "Plan ready", "done");
    planState.planResult = {
      projectId: typeof data.project_id === "string" ? data.project_id : undefined,
      projectName: typeof data.project_name === "string" ? data.project_name : undefined,
      taskCount: typeof data.task_count === "number" ? data.task_count : undefined,
      milestoneCount: typeof data.milestone_count === "number" ? data.milestone_count : undefined,
      conflictCount: typeof data.conflict_count === "number" ? data.conflict_count : undefined,
      risk: data.risk as PlanResult["risk"],
      wikiPageUrl: typeof data.wiki_page_url === "string" ? data.wiki_page_url : undefined,
      knowledgeGaps: Array.isArray(data.knowledge_gaps)
        ? data.knowledge_gaps.filter((item): item is string => typeof item === "string")
        : undefined,
      critiqueScore: typeof data.critique_score === "number" ? data.critique_score : undefined,
    };
    return { ...msg, text, isStreaming: false, planningState: planState };
  }

  return { ...msg, text, planningState: planState, isStreaming: true };
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

  // Close review panel on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsReviewOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Review states
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewMutations, setReviewMutations] = useState<ReviewMutation[]>([]);
  const [reviewPlanPreview, setReviewPlanPreview] = useState<ReviewPlanPreview | null>(null);
  const [reviewChangesetId, setReviewChangesetId] = useState<string | null>(null);

  const handleApproveReview = async (approvedIndices?: string[]) => {
    setLoading(true);
    try {
      if (mode === "manage" && reviewChangesetId && projectId) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
        const auth = await getApiAuthHeaders();
        const res = await fetch(`${API_BASE}/planning/${teamId}/projects/${projectId}/changesets/${reviewChangesetId}/approve/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({ approved_indices: approvedIndices, apply_remediation: true }),
        });
        if (!res.ok) throw new Error("Approval failed");
      }
      setIsReviewOpen(false);
      onPlanGenerated({
        projectName: reviewPlanPreview?.projectName || "Approved Plan",
        description: reviewPlanPreview?.description || "",
        tasks: [],
        milestones: [],
      });
    } catch (e) {
      console.error(e);
      alert("Failed to approve plan.");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectReview = async () => {
    setLoading(true);
    try {
      if (mode === "manage" && reviewChangesetId && projectId) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
        const auth = await getApiAuthHeaders();
        await fetch(`${API_BASE}/planning/${teamId}/projects/${projectId}/changesets/${reviewChangesetId}/reject/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
        });
      }
      setIsReviewOpen(false);
      setReviewMutations([]);
      setReviewPlanPreview(null);
      setReviewChangesetId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReviseReview = async (feedback: string) => {
    setIsReviewOpen(false);
    await handleSend(`Revise the current plan based on this feedback: ${feedback}`);
  };

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
    if (loading) return;
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

      // Pass conversation history so the AI never asks repeated questions
      // Include the current user message which hasn't been applied to state yet
      const history = [
        ...messages.filter((m) => !m.isStreaming && (m.text || "").trim()),
        { sender: "user", text },
      ].map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text || "",
      }));
      if (history.length > 0) {
        streamBody.history = history;
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
      const currentEventRef = { value: "" };

      const handleStreamEvent = (event: string, data: Record<string, unknown>) => {
        if (event === "plan_changeset_ready") {
          setReviewChangesetId(String(data.changeset_id || ""));
          setReviewMutations([]);
          setIsReviewOpen(true);
        } else if (event === "plan_mutation_pending") {
          const mut = data.mutation as ReviewMutation;
          if (mut) {
            setReviewMutations((prev) => [...prev, mut]);
          }
        } else if (event === "reasoning_done" || event === "agent_done") {
          if (data.projectName || data.tasks || data.milestones || data.project_name) {
            setReviewPlanPreview({
              projectName: String(data.projectName || data.project_name || "New Plan"),
              description: String(data.description || ""),
              tasks: Array.isArray(data.tasks) ? data.tasks : [],
              milestones: Array.isArray(data.milestones) ? data.milestones : [],
            });
            if (mode === "create") {
              setIsReviewOpen(true);
            }
          }
        } else if (event === "ask_user") {
          // ask_user: stop loading flag, show question card inline
          setLoading(false);
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? applyArchitectStreamEvent(msg, event, data) : msg
          )
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          processSseLines(lines, currentEventRef, handleStreamEvent);
        }
        if (done) {
          if (buffer.trim()) {
            processSseLines(buffer.split("\n"), currentEventRef, handleStreamEvent);
          }
          break;
        }
      }

      // Cleanup streaming flag; surface partial runs that never reached agent_done
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantMsgId) return msg;
          if (msg.planningState?.planResult) {
            return { ...msg, isStreaming: false };
          }
          if (msg.text) {
            return { ...msg, isStreaming: false };
          }
          return {
            ...msg,
            isStreaming: false,
            text: "The architect finished processing but did not return a final summary. Check server logs or try again.",
          };
        })
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-[var(--surface-1)] rounded-[28px] overflow-hidden flex flex-col h-[90vh] shadow-none border border-[var(--border-subtle)]"
      >
        {/* ── Header ── */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-900)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 opacity-30 blur-lg scale-110" />
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center shadow-none">
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
                      className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 transition-all shadow-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Description</label>
                    <textarea
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      placeholder="Optional details..."
                      className="w-full h-32 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 transition-all resize-none shadow-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsManualMode(false)} className="flex-1 h-12 rounded-2xl bg-[var(--surface-2)] text-[var(--text-secondary)] font-semibold border border-[var(--border-subtle)] transition-all hover:bg-[var(--surface-3)]">
                      Back to AI Chat
                    </button>
                    <button
                      onClick={handleManualSubmit}
                      disabled={!manualName.trim() || loading}
                      className="flex-[2] h-12 bg-[var(--accent)] text-[var(--bg-950)] font-bold rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-none"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Create Blank Project</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Unified AI Chat layout */
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden"
              >
                {/* ── Left: Chat messages ── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
                  
                  {/* Messages scroll area */}
                  <div className={cn("flex-1 overflow-y-auto custom-scrollbar", messages.length <= 1 && "hidden")}>
                    <ChatMessageList
                      messages={messages}
                      loading={loading}
                      isReviewOpen={isReviewOpen}
                      reviewMutations={reviewMutations}
                      reviewPlanPreview={reviewPlanPreview}
                      onApproveReview={handleApproveReview}
                      onRejectReview={handleRejectReview}
                      onReviseReview={handleReviseReview}
                      onSend={(answer) => {
                        const msgId = messages.find(m => m.question)?.id;
                        if (msgId) {
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msgId ? { ...m, question: undefined } : m
                            )
                          );
                        }
                        void handleSend(answer);
                      }}
                      onOpenProject={(msg) => {
                        onPlanGenerated({
                          projectName: msg.planningState?.planResult?.projectName || "AI Plan",
                          description: `${msg.planningState?.planResult?.taskCount ?? 0} tasks · ${msg.planningState?.planResult?.milestoneCount ?? 0} milestones`,
                          tasks: [],
                          milestones: [],
                        });
                      }}
                      PlanReviewPanel={PlanReviewPanel}
                    />
                    <div ref={chatEndRef} />
                  </div>

                  {/* ── Empty Landing & Bottom Input Container ─────────────────────── */}
                  <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 240, damping: 28 }}
                    className={cn(
                      "w-full transition-all duration-300 border-none shadow-none flex flex-col items-center",
                      messages.length > 1
                        ? "shrink-0 bg-[var(--bg-950)]/50 p-4 border-t border-white/5" 
                        : "flex-1 justify-center p-6 max-w-xl mx-auto overflow-y-auto"
                    )}
                  >
                    {messages.length <= 1 && (
                      <LandingView mode={mode} onSend={handleSend} />
                    )}

                    <InputBar
                      inputText={inputText}
                      setInputText={setInputText}
                      onSend={() => void handleSend()}
                      loading={loading}
                      isListening={isListening}
                      onStartVoice={startVoiceMode}
                    />
                  </motion.div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

    </motion.div>
  );
}
