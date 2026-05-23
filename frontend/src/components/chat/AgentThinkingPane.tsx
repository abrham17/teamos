"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BrainCircuit, AlertTriangle, RotateCcw, RefreshCw, ChevronDown } from "lucide-react";
import type { AgentThinking, AgentReflection, AgentStep } from "./chatTypes";
import { Check } from "lucide-react";
import { LottiePlayer } from "@/components/ui/LottiePlayer";
import { ICONSCOUT } from "@/lib/iconscoutAssets";

interface AgentThinkingPaneProps {
  thoughts: AgentThinking[];
  reflections: AgentReflection[];
  steps?: AgentStep[];
  isActive: boolean;
}

export function AgentThinkingPane({ thoughts, reflections, steps = [], isActive }: AgentThinkingPaneProps) {
  const [expanded, setExpanded] = useState(false);

  const totalItems = thoughts.length + steps.length + reflections.filter(r => !r.success).length;
  if (totalItems === 0) return null;

  const doneSteps = steps.filter(s => s.ok === true).length;
  const activeStep = steps.find(s => s.ok === undefined);
  const hasError = steps.some(s => s.ok === false);

  const summaryLabel = activeStep
    ? activeStep.name.replace(/_/g, " ")
    : hasError
    ? "Some steps failed"
    : steps.length > 0
    ? `${doneSteps}/${steps.length} steps complete`
    : "Reasoning…";

  return (
    <div className="mb-2 ml-1 w-full max-w-[85%]">
      {/* ── Disclosure toggle ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors group"
      >
        <BrainCircuit className={`w-3.5 h-3.5 shrink-0 transition-colors ${isActive ? "text-[var(--accent)] animate-pulse" : "text-[var(--text-dim)]"}`} />
        <span className={isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}>
          {summaryLabel}
        </span>
        {steps.length > 0 && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${hasError ? "bg-[var(--danger-bg)] text-[var(--danger)]" : isActive ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--success-bg)] text-[var(--success)]"}`}>
            {doneSteps}/{steps.length}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* ── Expanded content ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-1 pl-3 border-l border-[var(--border-subtle)] space-y-3 pb-2">

              {/* Vertical step-rail */}
              {steps.length > 0 && (
                <div className="space-y-0">
                  {steps.map((step, idx) => {
                    const isDone = step.ok === true;
                    const isErr = step.ok === false;
                    const isPending = step.ok === undefined;
                    const isLast = idx === steps.length - 1;

                    return (
                      <motion.div
                        key={`step-${idx}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="flex gap-3"
                      >
                        {/* Circle + connector line */}
                        <div className="flex flex-col items-center">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300 ${
                            isDone ? "bg-[var(--success-bg)] border-[var(--success)] text-[var(--success)]" :
                            isErr  ? "bg-[var(--danger-bg)] border-[var(--danger)] text-[var(--danger)]" :
                                     "bg-[var(--surface-2)] border-[var(--accent)] text-[var(--accent)]"
                          }`}>
                            {isDone && <Check className="w-2.5 h-2.5" />}
                            {isErr  && <AlertTriangle className="w-2.5 h-2.5" />}
                            {isPending && (
                              <LottiePlayer
                                src={ICONSCOUT.lottie.aiToolPending}
                                width={14}
                                height={14}
                                aria-label="Step in progress"
                              />
                            )}
                          </div>
                          {!isLast && <div className="w-[2px] flex-1 min-h-[14px] bg-[var(--border-subtle)] mt-0.5" />}
                        </div>
                        {/* Label */}
                        <div className={`pb-3 pt-0.5 text-[11px] leading-tight ${
                          isDone ? "text-[var(--text-muted)]" :
                          isErr  ? "text-[var(--danger)]" :
                                   "text-[var(--text-primary)] font-semibold"
                        }`}>
                          {step.name.replace(/_/g, " ")}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Thought blocks */}
              {thoughts.map((thought, idx) => (
                <motion.div
                  key={`thought-${idx}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="text-[11px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-900)] rounded-lg px-3 py-2 border border-[var(--border-subtle)] italic"
                >
                  {thought.content}
                </motion.div>
              ))}

              {/* Reflection alerts */}
              {reflections.filter(r => !r.success).map((reflection, idx) => (
                <motion.div
                  key={`reflection-${idx}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-[11px] leading-relaxed rounded-lg px-3 py-2 border flex items-start gap-2 ${
                    reflection.severity === "critical"
                      ? "bg-[var(--danger-bg)] border-[var(--danger)]/20 text-[var(--danger)]"
                      : "bg-[var(--warning)]/5 border-[var(--warning)]/20 text-[var(--warning)]"
                  }`}
                >
                  {reflection.should_replan ? (
                    <RefreshCw className="w-3 h-3 shrink-0 mt-0.5" />
                  ) : reflection.should_retry ? (
                    <RotateCcw className="w-3 h-3 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  )}
                  <span>
                    {reflection.feedback}
                    {reflection.should_replan && <span className="ml-1 font-bold text-[10px] uppercase">→ Replanning</span>}
                    {reflection.should_retry  && <span className="ml-1 font-bold text-[10px] uppercase">→ Retrying</span>}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
