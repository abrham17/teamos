"use client";

import { useState } from "react";
import { Check, AlertCircle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { groupAgentSteps } from "./utils";
import type { AgentStepEntry } from "./types";

interface AgentStepLogProps {
  steps: AgentStepEntry[];
  loading: boolean;
}

export function AgentStepLog({ steps, loading }: AgentStepLogProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    reasoning: false,
    execution: false,
    postProcessing: false,
  });

  if (steps.length === 0) return null;

  const groups = groupAgentSteps(steps);
  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const renderStep = (step: AgentStepEntry, idx: number) => {
    const isDone = step.status === "done";
    const isErr = step.status === "error";
    const isRunning = step.status === "running";

    return (
      <div key={`${step.name}-${idx}`} className="flex items-center gap-2 text-[11px] py-0.5">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          isDone ? "border-[var(--success)] text-[var(--success)]" :
          isErr ? "border-[var(--danger)] text-[var(--danger)]" :
          isRunning ? "border-[var(--accent)] text-[var(--accent)]" :
          "border-[var(--border-strong)] text-[var(--text-dim)]"
        }`}>
          {isDone && <Check className="h-3 w-3" />}
          {isErr && <AlertCircle className="h-3 w-3" />}
          {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
        </span>
        <span className={isRunning ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
          {step.label}
        </span>
      </div>
    );
  };

  const renderGroup = (title: string, groupKey: string, groupSteps: AgentStepEntry[]) => {
    if (groupSteps.length === 0) return null;
    const isCollapsed = collapsedGroups[groupKey];

    return (
      <div className="mt-2">
        <button
          onClick={() => toggleGroup(groupKey)}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors w-full"
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {title} ({groupSteps.length})
        </button>
        {!isCollapsed && (
          <div className="mt-1 ml-4 grid gap-0.5">
            {groupSteps.map((step, idx) => renderStep(step, idx))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)]/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-1.5 w-1.5 rounded-full ${loading ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--success)]"}`} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Execution Log
        </span>
      </div>

      {renderGroup("Reasoning", "reasoning", groups.reasoning)}
      {renderGroup("Plan Execution", "execution", groups.execution)}
      {renderGroup("Post-Processing", "postProcessing", groups.postProcessing)}
    </div>
  );
}
