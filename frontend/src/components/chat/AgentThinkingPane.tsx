"use client";

import { motion, AnimatePresence } from "motion/react";
import { BrainCircuit, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { AgentThinking, AgentReflection, AgentStep } from "./chatTypes";

interface AgentThinkingPaneProps {
  thoughts: AgentThinking[];
  reflections: AgentReflection[];
  steps?: AgentStep[];
  isActive: boolean;
}

/**
 * Displays raw model reasoning only — no process step-rail, no progress bars.
 * Thoughts stream in as italic text directly on the chat background.
 */
export function AgentThinkingPane({
  thoughts,
  reflections,
  steps = [],
  isActive,
}: AgentThinkingPaneProps) {
  const [expanded, setExpanded] = useState(true);

  // Active step label for the toggle button
  const activeStep = steps.find((s) => s.ok === undefined);
  const statusLabel = activeStep
    ? activeStep.name.replace(/_/g, " ")
    : isActive
    ? "Reasoning..."
    : "Thought process";

  const hasContent =
    thoughts.length > 0 || reflections.filter((r) => !r.success).length > 0;

  if (!hasContent && !isActive) return null;

  return (
    <div className="mb-2 ml-1 w-full max-w-[85%]">
      {/* Toggle — minimal, no step counters */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors group select-none"
      >
        <BrainCircuit
          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
            isActive ? "text-[var(--accent)] animate-pulse" : "text-[var(--text-dim)]"
          }`}
        />
        <span className={isActive ? "text-[var(--accent)]" : ""}>
          {statusLabel}
        </span>
        {isActive && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
        )}
        <ChevronDown
          className={`w-3 h-3 ml-auto transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded: raw model thoughts only */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 pl-4 border-l border-[var(--border-subtle)] space-y-2 pb-1">
              {thoughts.map((thought, idx) => (
                <motion.p
                  key={`thought-${idx}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.04 }}
                  className="text-[11px] leading-relaxed text-[var(--text-dim)] italic whitespace-pre-wrap select-none"
                >
                  {thought.content}
                </motion.p>
              ))}

              {/* Only show failed reflections — not a step list */}
              {reflections
                .filter((r) => !r.success)
                .map((reflection, idx) => (
                  <motion.p
                    key={`reflection-${idx}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`text-[11px] leading-relaxed italic ${
                      reflection.severity === "critical"
                        ? "text-[var(--danger)]"
                        : "text-[var(--warning)]"
                    }`}
                  >
                    {reflection.feedback}
                  </motion.p>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
