"use client";

import { BrainCircuit, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentThinking, AgentReflection, AgentStep } from "./chatTypes";

interface AgentThinkingPaneProps {
  thoughts: AgentThinking[];
  reflections: AgentReflection[];
  steps?: AgentStep[];
  isActive: boolean;
}

export function AgentThinkingPane({
  thoughts,
  reflections,
  steps = [],
  isActive,
}: AgentThinkingPaneProps) {
  const [expanded, setExpanded] = useState(true);

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
    <div className="mb-2 w-full">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors select-none"
      >
        <BrainCircuit
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            isActive ? "text-[var(--accent)] animate-pulse" : "text-[var(--text-dim)]"
          )}
        />
        <span className={isActive ? "text-[var(--accent)]" : ""}>
          {statusLabel}
        </span>
        {isActive && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 ml-auto transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="mt-1.5 p-3 rounded-lg bg-[var(--bg-800)] border border-[var(--border-subtle)] space-y-2">
          {thoughts.map((thought, idx) => (
            <p
              key={`thought-${idx}`}
              className="text-[11px] leading-relaxed text-[var(--text-dim)] italic whitespace-pre-wrap select-none"
            >
              {thought.content}
            </p>
          ))}

          {reflections
            .filter((r) => !r.success)
            .map((reflection, idx) => (
              <p
                key={`reflection-${idx}`}
                className={cn(
                  "text-[11px] leading-relaxed italic",
                  reflection.severity === "critical"
                    ? "text-[var(--danger)]"
                    : "text-[var(--warning)]"
                )}
              >
                {reflection.feedback}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
