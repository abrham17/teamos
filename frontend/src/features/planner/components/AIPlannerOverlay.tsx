"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Sparkles,
  Wand2,
  BrainCircuit,
  Loader2,
  Check,
  ArrowRight,
  Mic,
  MicOff,
  PenTool,
} from "lucide-react";
import { planAssistDraft } from "../api";
import type { PlanProjectDetail } from "../types";

interface AIPlannerOverlayProps {
  teamId: string;
  onClose: () => void;
  onPlanGenerated: (plan: any) => void;
  mode?: "create" | "manage";
  projectContext?: PlanProjectDetail | null;
}

type Phase = "input" | "thinking" | "review" | "manual";

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
  const recognitionRef = useRef<any>(null);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [thoughts, setThoughts] = useState<string[]>([]);

  // Manual fields
  const [manualName, setManualName] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  const startVoiceMode = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
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

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setPhase("thinking");

    const thinkingThoughts =
      mode === "manage"
        ? [
            "Analyzing existing roadmap...",
            "Identifying bottlenecks...",
            "Optimizing resource allocation...",
            "Re-aligning dependencies...",
          ]
        : [
            "Analyzing project scope...",
            "Identifying key milestones...",
            "Estimating task durations...",
            "Evaluating dependencies...",
          ];

    setThoughts(thinkingThoughts);

    try {
      const res = await planAssistDraft(teamId, {
        prompt,
        mode,
        project_id: projectContext?.id,
      });
      // api.post already unwrapped the 'data' field. res IS the plan draft.
      setGeneratedPlan(res);
      setPhase("review");
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to process request. Please try again.");
      setPhase("input");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    if (!manualName.trim()) return;
    onPlanGenerated({
      projectName: manualName,
      description: manualDesc,
      tasks: [],
      milestones: [],
    });
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
                    disabled={!manualName.trim()}
                    className="flex-[2] h-14 bg-[var(--accent)] text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 disabled:opacity-50 transition-all shadow-xl shadow-[var(--accent-glow)]"
                  >
                    Create Blank Project
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {phase === "thinking" && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-16 flex flex-col items-center justify-center space-y-10"
              >
                <div className="relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="w-24 h-24 rounded-[32px] border-4 border-dashed border-[var(--accent-subtle)] flex items-center justify-center"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--surface-1)] shadow-xl flex items-center justify-center border border-[var(--border-subtle)]">
                      <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
                    </div>
                  </div>
                </div>
                <div className="text-center space-y-3">
                  <h3 className="text-2xl font-medium text-[var(--text-primary)]">
                    {mode === "manage" ? "Architecting Changes" : "Processing Requirements"}
                  </h3>
                  <div className="flex flex-col gap-3 mt-6 max-w-sm mx-auto">
                    {thoughts.map((t, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.4 }}
                        className="flex items-center gap-3 text-sm font-medium text-[var(--text-muted)]"
                      >
                        <div className="w-5 h-5 rounded-full bg-[var(--success-bg)] flex items-center justify-center">
                          <Check className="w-3 h-3 text-[var(--success)]" />
                        </div>
                        {t}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {phase === "review" && generatedPlan && (
              <motion.div
                key="review"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                <div className="bg-[var(--bg-900)] border-2 border-[var(--accent-subtle)] rounded-2xl p-8 shadow-sm">
                  <h3 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
                    {generatedPlan.projectName}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {generatedPlan.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center justify-between">
                      <span>Agentic Roadmap ({generatedPlan.tasks?.length || 0})</span>
                      {mode === "manage" && (
                        <span className="bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-0.5 rounded">
                          Modified
                        </span>
                      )}
                    </h4>
                    <div className="space-y-2">
                      {(generatedPlan.tasks || []).slice(0, 4).map((t: any, i: number) => (
                        <div
                          key={i}
                          className="bg-[var(--surface-1)] p-4 rounded-xl text-[13px] font-medium flex items-center justify-between border border-[var(--border-subtle)] shadow-sm"
                        >
                          <span className="truncate flex-1 pr-3 text-[var(--text-secondary)]">
                            {t.title}
                          </span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${
                              t.priority === "high"
                                ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                                : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                            }`}
                          >
                            {t.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Milestones ({generatedPlan.milestones?.length || 0})
                    </h4>
                    <div className="space-y-2">
                      {(generatedPlan.milestones || []).slice(0, 4).map((m: any, i: number) => (
                        <div
                          key={i}
                          className="bg-[var(--surface-1)] p-4 rounded-xl text-[13px] font-medium flex items-center justify-between border-l-4 border-[var(--accent)] shadow-sm"
                        >
                          <span className="truncate flex-1 pr-3 text-[var(--text-secondary)]">
                            {m.title}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[var(--text-muted)]">
                            {m.date}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 sticky bottom-0 bg-[var(--surface-1)] py-4 border-t border-[var(--border-subtle)]">
                  <button
                    onClick={() => setPhase("input")}
                    className="flex-1 h-14 rounded-2xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] font-bold transition-all border border-[var(--border-subtle)] shadow-sm"
                  >
                    Modify Prompt
                  </button>
                  <button
                    onClick={() => onPlanGenerated(generatedPlan)}
                    className="flex-[2] h-14 rounded-2xl bg-[var(--accent)] text-white font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-xl shadow-[var(--accent-glow)]"
                  >
                    {mode === "manage" ? "Apply Architect Changes" : "Confirm & Initialize"}
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
