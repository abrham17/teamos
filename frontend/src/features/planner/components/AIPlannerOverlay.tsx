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
import {
  planAssistStream,
  type PlannerAgentStep,
  type PlannerAgentResult,
  type PlannerAgentDone,
} from "../api";
import type { PlanProjectDetail } from "../types";

interface AIPlannerOverlayProps {
  teamId: string;
  onClose: () => void;
  onPlanGenerated: (plan: { projectName: string; description: string; tasks: unknown[]; milestones: unknown[] }) => Promise<void> | void;
  mode?: "create" | "manage";
  projectContext?: PlanProjectDetail | null;
}

type Phase = "input" | "executing" | "review" | "manual";

interface AgentStepEntry {
  name: string;
  label: string;
  status: "running" | "done" | "error";
  result?: Record<string, unknown>;
}

const STEP_LABELS: Record<string, string> = {
  plan_generate_draft: "Generating draft",
  plan_create_project: "Creating project",
  plan_update_project: "Updating project",
  plan_create_task: "Adding task",
  plan_create_milestone: "Adding milestone",
  plan_detect_conflicts: "Detecting conflicts",
  plan_risk_assessment: "Assessing risk",
  plan_sync_wiki: "Syncing to wiki",
  plan_check_overdue: "Checking overdue",
};

function getStepLabel(name: string, args?: string): string {
  const base = STEP_LABELS[name] || name.replace(/_/g, " ");
  if (name === "plan_create_task" && args) {
    try {
      const parsed = JSON.parse(args);
      if (parsed.index && parsed.total) return `Adding task ${parsed.index}/${parsed.total}`;
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
  onClose,
  onPlanGenerated,
  mode = "create",
  projectContext,
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
  const [agentDoneData, setAgentDoneData] = useState<PlannerAgentDone | null>(null);

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

  const resetExecutionState = useCallback(() => {
    setAgentSteps([]);
    setStatusText("");
    setAgentDoneData(null);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    resetExecutionState();
    setPhase("executing");

    try {
      await planAssistStream(
        teamId,
        {
          prompt,
          mode,
          project_id: projectContext?.id,
        },
        {
          onStep: (step: PlannerAgentStep) => {
            const label = getStepLabel(step.name, step.arguments);
            setAgentSteps((prev) => [...prev, { name: step.name, label, status: "running" }]);
          },
          onResult: (result: PlannerAgentResult) => {
            setAgentSteps((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].name === result.name && next[i].status === "running") {
                  next[i] = { ...next[i], status: result.ok ? "done" : "error", result: result.result };
                  break;
                }
              }
              return next;
            });
          },
          onStatus: (status: string) => {
            setStatusText(status);
          },
          onDone: (data: PlannerAgentDone) => {
            setAgentDoneData(data);
            setPhase("review");
          },
          onError: (detail: string) => {
            console.error(detail);
            alert(detail);
            setPhase("input");
          },
        },
      );
    } catch (error: unknown) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to process request. Please try again.");
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
                {phase === "manual"
                  ? "Manual Setup"
                  : mode === "manage"
                    ? "Architect Consult"
                    : "PlanArchitect AI"}
              </h2>
              <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
                {phase === "manual"
                  ? "Custom Strategy Creation"
                  : mode === "manage"
                    ? `Analyzing: ${projectContext?.name}`
                    : "Agentic Planning Engine"}
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
                      {mode === "manage" ? "What should I change?" : "Project Mission"}
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
                      placeholder={
                        mode === "manage"
                          ? "e.g., 'Delay all pending tasks by 1 week'..."
                          : "e.g., 'Architect a migration strategy for a high-traffic platform...'"
                      }
                      className="w-full h-44 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-2xl p-5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] focus:border-[var(--accent)] transition-all resize-none leading-relaxed text-sm shadow-inner"
                    />
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] font-bold text-[var(--text-dim)]">
                      <Sparkles className="w-3 h-3" />
                      Powered by TeamOS LLM
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(mode === "manage"
                      ? ["Optimize Roadmap", "Add Deployment Phase", "Extend Deadline"]
                      : ["Product Launch", "Event Planning", "SaaS MVP"]
                    ).map((tag) => (
                      <button
                        key={tag}
                        onClick={() =>
                          setPrompt(
                            mode === "manage"
                              ? tag
                              : `Generate a 3-month strategic plan for a ${tag}`,
                          )
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
                  {mode === "manage" ? "Architect Update" : "Build Plan with Agent"}
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

            {phase === "review" && agentDoneData && (
              <motion.div
                key="review"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* Project header */}
                <div className="bg-[var(--bg-900)] border-2 border-[var(--accent-subtle)] rounded-2xl p-6 shadow-sm">
                  <h3 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
                    {agentDoneData.project_name}
                  </h3>
                  {agentDoneData.description && (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>
                        {agentDoneData.description}
                      </ReactMarkdown>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
                      {agentDoneData.task_count} tasks
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-[var(--accent)]" />
                      {agentDoneData.milestone_count} milestones
                    </span>
                  </div>
                </div>

                {/* Risk & Conflicts row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Risk card */}
                  <div className={`p-4 rounded-xl border ${riskBg(agentDoneData.risk.score)} border-[var(--border-subtle)]`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className={`w-4 h-4 ${riskColor(agentDoneData.risk.score)}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Risk Score</span>
                    </div>
                    <div className={`text-3xl font-black ${riskColor(agentDoneData.risk.score)}`}>
                      {agentDoneData.risk.score}<span className="text-sm font-medium text-[var(--text-dim)]">/100</span>
                    </div>
                    {agentDoneData.risk.factors.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {agentDoneData.risk.factors.slice(0, 3).map((f, i) => (
                          <li key={i} className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-[var(--warning)] shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Conflicts card */}
                  <div className={`p-4 rounded-xl border ${agentDoneData.conflict_count > 0 ? "bg-[var(--danger-bg)]" : "bg-[var(--success-bg)]"} border-[var(--border-subtle)]`}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className={`w-4 h-4 ${agentDoneData.conflict_count > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Conflicts</span>
                    </div>
                    <div className={`text-3xl font-black ${agentDoneData.conflict_count > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                      {agentDoneData.conflict_count}
                    </div>
                    {agentDoneData.conflict_count > 0 && (
                      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                        Scheduling overlaps detected — review recommended
                      </p>
                    )}
                    {agentDoneData.conflict_count === 0 && (
                      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">No scheduling conflicts</p>
                    )}
                  </div>
                </div>

                {/* Suggestions */}
                {agentDoneData.risk.suggestions.length > 0 && (
                  <div className="bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                      AI Suggestions
                    </h4>
                    <ul className="space-y-1.5">
                      {agentDoneData.risk.suggestions.map((s, i) => (
                        <li key={i} className="text-[12px] text-[var(--text-secondary)] flex items-start gap-2">
                          <ArrowRight className="w-3 h-3 text-[var(--accent)] shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Wiki sync status */}
                {agentDoneData.wiki_page_url && (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl px-4 py-3">
                    <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Project synced to wiki
                    <a href={agentDoneData.wiki_page_url} className="text-[var(--accent)] hover:underline ml-1">View page →</a>
                  </div>
                )}

                {/* Overdue warning */}
                {agentDoneData.overdue_count > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--warning)] bg-[var(--warning)]/5 border border-[var(--warning)]/20 rounded-xl px-4 py-3">
                    <Clock className="w-3.5 h-3.5" />
                    {agentDoneData.overdue_count} overdue task{agentDoneData.overdue_count > 1 ? "s" : ""} detected across team projects
                  </div>
                )}

                {/* Knowledge gaps */}
                {agentDoneData.knowledge_gaps.length > 0 && (
                  <div className="bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                      Knowledge Gaps
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {agentDoneData.knowledge_gaps.map((gap, i) => (
                        <span key={i} className="text-[10px] px-2 py-1 rounded-md bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">
                          {gap}
                        </span>
                      ))}
                    </div>
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
                      if (agentDoneData.project_id) {
                        onPlanGenerated({
                          projectName: agentDoneData.project_name,
                          description: agentDoneData.description,
                          tasks: [],
                          milestones: [],
                        });
                      }
                    }}
                    className="flex-[2] h-14 rounded-2xl bg-[var(--accent)] text-white font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-xl shadow-[var(--accent-glow)]"
                  >
                    {mode === "manage" ? "Apply Architect Changes" : "Confirm & Open Project"}
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
