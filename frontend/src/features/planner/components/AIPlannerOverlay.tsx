"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Sparkles,
  Wand2,
  BrainCircuit,
  Loader2,
  Check,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Mic,
  MicOff,
  PenTool,
  AlertTriangle,
  Shield,
  FileText,
  Clock,
} from "lucide-react";
import { api, getApiAuthHeaders } from "@/lib/api";
import type { PlanProjectDetail } from "../types";

interface AIPlannerOverlayProps {
  teamId: string;
  /** "create" = new project; "manage" = update active project (requires projectId). */
  mode?: "create" | "manage";
  /** Required when mode is "manage". */
  projectId?: string | null;
  onClose: () => void;
  onPlanGenerated: (plan: { projectName: string; description: string; tasks: unknown[]; milestones: unknown[] }) => Promise<void> | void;
}

type Phase = "input" | "executing" | "review" | "manual";

interface AgentStepEntry {
  name: string;
  label: string;
  status: "running" | "done" | "error";
  result?: Record<string, unknown>;
}

const STEP_LABELS: Record<string, string> = {
  // Reasoning pipeline stages
  reasoning_decompose: "Decomposing mission into sub-goals",
  reasoning_research: "Researching wiki knowledge per sub-goal",
  reasoning_draft: "Drafting plan with reasoning traces",
  reasoning_critique: "Self-critiquing plan for issues",
  reasoning_finalize: "Inferring dependencies & scheduling",
  // Entity creation
  plan_generate_draft: "Generating plan draft",
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
  // Fallbacks
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
  const [phase, setPhase] = useState<Phase>("input");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Agent execution state
  const [agentSteps, setAgentSteps] = useState<AgentStepEntry[]>([]);
  const [statusText, setStatusText] = useState("");
  const [finalResponse, setFinalResponse] = useState<string>("");

  // Manual fields
  const [manualName, setManualName] = useState("");
  const [manualDesc, setManualDesc] = useState("");

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
    recognition.onerror = (event: { error: unknown }) => {
      console.error(event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: { resultIndex: number; results: { length: number; [key: number]: { isFinal: boolean; [key: number]: { transcript: string } } } }) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setPrompt((prev) => prev + " " + finalTranscript);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  // Plan result data from agent_done
  const [planResult, setPlanResult] = useState<{
    projectId?: string;
    projectName?: string;
    taskCount?: number;
    milestoneCount?: number;
    conflictCount?: number;
    risk?: { score: number; factors: string[]; suggestions: string[] };
    wikiPageUrl?: string;
    knowledgeGaps?: string[];
    critiqueScore?: number;
  } | null>(null);

  const resetExecutionState = useCallback(() => {
    setAgentSteps([]);
    setStatusText("");
    setFinalResponse("");
    setPlanResult(null);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (mode === "manage" && !projectId) {
      alert("No project is selected. Open a project and use Ask AI from the overview.");
      return;
    }
    setLoading(true);
    resetExecutionState();
    setPhase("executing");

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(await getApiAuthHeaders()),
      };

      const streamBody: { prompt: string; mode: string; project_id?: string } = { prompt, mode };
      if (mode === "manage" && projectId) {
        streamBody.project_id = projectId;
      }

      // Call the dedicated planning agent endpoint (create vs manage must match backend).
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

              if (currentEvent === "agent_status") {
                setStatusText(data.status || "");

              } else if (currentEvent === "agent_step") {
                const name = data.name || "";
                const label = getStepLabel(name, JSON.stringify(data.arguments || {}));
                setAgentSteps((prev) => [...prev, { name, label, status: "running" }]);

              } else if (currentEvent === "agent_result") {
                const name = data.name || "";
                setAgentSteps((prev) => {
                  const next = [...prev];
                  for (let i = next.length - 1; i >= 0; i--) {
                    if (next[i].name === name && next[i].status === "running") {
                      next[i] = { ...next[i], status: data.ok ? "done" : "error", result: data.result };
                      break;
                    }
                  }
                  return next;
                });

              } else if (currentEvent === "reasoning_done") {
                // Pipeline finished reasoning — entity creation follows
                setStatusText("Reasoning complete. Creating project entities...");

              } else if (currentEvent === "agent_done") {
                setPlanResult({
                  projectId: data.project_id,
                  projectName: data.project_name,
                  taskCount: data.task_count,
                  milestoneCount: data.milestone_count,
                  conflictCount: data.conflict_count,
                  risk: data.risk,
                  wikiPageUrl: data.wiki_page_url,
                  knowledgeGaps: data.knowledge_gaps,
                  critiqueScore: data.critique_score,
                });
                setPhase("review");

              } else if (currentEvent === "agent_error") {
                throw new Error(data.detail || "Planning agent error");
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.startsWith("Planning agent error")) throw parseErr;
              /* skip parse errors */
            }
            currentEvent = "";
          }
        }
      }
      // If we finished streaming without agent_done, transition anyway
      if (phase === "executing") setPhase("review");

    } catch (error: unknown) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to generate plan. Please try again.");
      setPhase("input");
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
        className="w-full max-w-3xl bg-[var(--surface-1)] rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl border border-[var(--border-subtle)]"
      >
        <header className="p-8 pb-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
              <BrainCircuit className="w-7 h-7 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Plan Architect AI
              </h2>
              <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
                {mode === "manage" ? "Update Current Project" : "Agentic Planning Engine"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-700)] rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg-950)]/50">
          <AnimatePresence mode="wait">
            {phase === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Project Mission
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPhase("manual")}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all bg-[var(--surface-2)] shadow-sm"
                      >
                        <PenTool className="w-3 h-3" />
                        Manual Setup
                      </button>
                      <button
                        onClick={startVoiceMode}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                          isListening
                            ? "bg-[var(--danger)] text-white animate-pulse"
                            : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        {isListening ? "Stop Voice" : "Voice Mode"}
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., 'Architect a migration strategy for a high-traffic platform...'"
                      className="w-full h-44 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-2xl p-5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] focus:border-[var(--accent)] transition-all resize-none leading-relaxed text-sm shadow-inner"
                    />
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] font-bold text-[var(--text-dim)]">
                      <Sparkles className="w-3 h-3" />
                      Powered by TeamOS LLM
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Product Launch", "Event Planning", "SaaS MVP"].map((tag) => (
                      <button
                        key={tag}
                        onClick={() =>
                          setPrompt(`Generate a 3-month strategic plan for a ${tag}`)
                        }
                        className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] dark:text-[var(--text-secondary)] transition-all border border-[var(--border-subtle)] shadow-sm active:scale-95"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || loading}
                  className="w-full h-14 bg-[var(--accent)] text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 disabled:opacity-50 transition-all shadow-xl shadow-[var(--accent-glow)]"
                >
                  <Wand2 className="w-5 h-5" />
                  {mode === "manage" ? "Update Plan with Agent" : "Build Plan with Agent"}
                </button>
              </motion.div>
            )}

            {phase === "manual" && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Enter project name..."
                      className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all"
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
                      className="w-full h-32 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setPhase("input")}
                    className="flex-1 h-14 rounded-2xl bg-[var(--surface-2)] text-[var(--text-secondary)] font-bold transition-all border border-[var(--border-subtle)]"
                  >
                    Back to AI
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
              </motion.div>
            )}

            {phase === "executing" && (
              <motion.div
                key="executing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 flex flex-col items-center justify-center space-y-8"
              >
                {/* Progress bar */}
                <div className="w-full max-w-md">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      {statusText || "Initializing agent..."}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-dim)]">
                      {agentSteps.filter((s) => s.status === "done").length}/{agentSteps.length} steps
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg-700)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[var(--accent)] rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${agentSteps.length > 0 ? (agentSteps.filter((s) => s.status === "done").length / agentSteps.length) * 100 : 0}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Step list */}
                <div className="w-full max-w-md space-y-2">
                  {agentSteps.map((step, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-3 text-sm"
                    >
                      <div className={`
                        w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all
                        ${step.status === "done" ? "bg-[var(--success-bg)] border-[var(--success)]/30 text-[var(--success)]" :
                          step.status === "error" ? "bg-[var(--danger-bg)] border-[var(--danger)]/30 text-[var(--danger)]" :
                          "bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-muted)]"}
                      `}>
                        {step.status === "done" && <CheckCircle2 className="w-3 h-3" />}
                        {step.status === "error" && <AlertCircle className="w-3 h-3" />}
                        {step.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                      </div>
                      <span className={`${
                        step.status === "done" ? "text-[var(--text-secondary)]" :
                        step.status === "error" ? "text-[var(--danger)]" :
                        "text-[var(--text-primary)] font-medium"
                      }`}>
                        {step.label}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* Spinner */}
                <div className="relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 rounded-2xl border-2 border-dashed border-[var(--accent-subtle)] flex items-center justify-center"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
                  </div>
                </div>
              </motion.div>
            )}

            {phase === "review" && (
              <motion.div
                key="review"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* Plan summary card */}
                {planResult && (
                  <div className="bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
                        {planResult.projectName || "Plan Created"}
                      </h3>
                      {planResult.wikiPageUrl && (
                        <a href={planResult.wikiPageUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:underline">
                          <FileText className="w-3 h-3" /> Wiki Page
                        </a>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-[var(--surface-2)] rounded-xl p-3 text-center">
                        <div className="text-2xl font-black text-[var(--text-primary)]">{planResult.taskCount ?? 0}</div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Tasks</div>
                      </div>
                      <div className="bg-[var(--surface-2)] rounded-xl p-3 text-center">
                        <div className="text-2xl font-black text-[var(--text-primary)]">{planResult.milestoneCount ?? 0}</div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Milestones</div>
                      </div>
                      <div className={`rounded-xl p-3 text-center ${planResult.risk ? riskBg(planResult.risk.score) : "bg-[var(--surface-2)]"}`}>
                        <div className={`text-2xl font-black ${planResult.risk ? riskColor(planResult.risk.score) : "text-[var(--text-primary)]"}`}>
                          {planResult.risk?.score ?? "—"}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Risk Score</div>
                      </div>
                    </div>
                    {(planResult.conflictCount ?? 0) > 0 && (
                      <div className="flex items-center gap-2 text-sm text-[var(--warning)] bg-[var(--warning)]/10 rounded-xl px-4 py-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {planResult.conflictCount} scheduling conflict{planResult.conflictCount! > 1 ? "s" : ""} detected — review in the Planner.
                      </div>
                    )}
                    {planResult.risk?.suggestions && planResult.risk.suggestions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Risk Mitigations</p>
                        {planResult.risk.suggestions.slice(0, 3).map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--accent)]" />
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {planResult.knowledgeGaps && planResult.knowledgeGaps.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Knowledge Gaps Identified</p>
                        <div className="flex flex-wrap gap-1.5">
                          {planResult.knowledgeGaps.slice(0, 5).map((gap, i) => (
                            <span key={i} className="text-[10px] px-2 py-1 rounded-lg bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">{gap}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Agent execution log (collapsible) */}
                <details className="group">
                  <summary className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] cursor-pointer hover:text-[var(--text-muted)] transition-colors">
                    Agent Execution Log ({agentSteps.length} steps)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {agentSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px]">
                        {step.status === "done" && <Check className="w-3 h-3 text-[var(--success)]" />}
                        {step.status === "error" && <AlertCircle className="w-3 h-3 text-[var(--danger)]" />}
                        {step.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />}
                        <span className="text-[var(--text-muted)] font-mono">{step.name}</span>
                        <span className="text-[var(--text-dim)]">— {step.label}</span>
                      </div>
                    ))}
                  </div>
                </details>

                {/* Action buttons */}
                <div className="flex gap-4 pt-4 sticky bottom-0 bg-[var(--surface-1)] py-4 border-t border-[var(--border-subtle)]">
                  <button
                    onClick={() => { resetExecutionState(); setPhase("input"); }}
                    className="flex-1 h-14 rounded-2xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] font-bold transition-all border border-[var(--border-subtle)] shadow-sm"
                  >
                    Modify Prompt
                  </button>
                  <button
                    onClick={() => {
                      onPlanGenerated({
                        projectName: planResult?.projectName || "AI Generated Plan",
                        description: `${planResult?.taskCount ?? 0} tasks · ${planResult?.milestoneCount ?? 0} milestones`,
                        tasks: [],
                        milestones: [],
                      });
                    }}
                    className="flex-[2] h-14 rounded-2xl bg-[var(--accent)] text-white font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-xl shadow-[var(--accent-glow)]"
                  >
                    Open in Planner
                    <ArrowRight className="w-5 h-5" />
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
