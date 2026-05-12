"use client";

import { motion, AnimatePresence } from "motion/react";
import { BrainCircuit, AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
import type { AgentThinking, AgentReflection } from "./chatTypes";

interface AgentThinkingPaneProps {
  thoughts: AgentThinking[];
  reflections: AgentReflection[];
  isActive: boolean;
}

export function AgentThinkingPane({ thoughts, reflections, isActive }: AgentThinkingPaneProps) {
  if (thoughts.length === 0 && reflections.length === 0) return null;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="border-l-2 border-[var(--accent-subtle)] pl-3 ml-2 mb-3 space-y-2"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
            <BrainCircuit className="w-3 h-3" />
            Agent Reasoning
          </div>

          {thoughts.map((thought, idx) => (
            <motion.div
              key={`thought-${idx}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="text-[12px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-900)] rounded-lg px-3 py-2 border border-[var(--border-subtle)]"
            >
              {thought.content}
            </motion.div>
          ))}

          {reflections
            .filter((r) => !r.success)
            .map((reflection, idx) => (
              <motion.div
                key={`reflection-${idx}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
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
                  {reflection.should_replan && (
                    <span className="ml-1 font-bold text-[10px] uppercase">→ Replanning</span>
                  )}
                  {reflection.should_retry && (
                    <span className="ml-1 font-bold text-[10px] uppercase">→ Retrying</span>
                  )}
                </span>
              </motion.div>
            ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
