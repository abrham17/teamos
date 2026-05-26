"use client";

import { CheckCircle2, AlertCircle, Loader2, Shield, FileText, ArrowRight, Check } from "lucide-react";
import { riskColor } from "./utils";
import type { PlanResult, AgentStepEntry } from "./types";

interface PlanSummaryCardProps {
  state: {
    statusText: string;
    agentSteps: AgentStepEntry[];
    planResult?: PlanResult | null;
  };
  loading: boolean;
  onOpenProject: () => void;
}

export function PlanSummaryCard({ state, loading, onOpenProject }: PlanSummaryCardProps) {
  return (
    <div className="mt-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-950)]/70 p-3 shadow-none">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
        <div className={`h-1.5 w-1.5 rounded-full ${loading ? "animate-pulse bg-[var(--accent)]" : state.planResult ? "bg-[var(--success)]" : "bg-[var(--border-strong)]"}`} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {loading ? "Executing" : state.planResult ? "Completed" : "Architect workflow"}
        </span>
      </div>

      {state.statusText && (
        <p className="mt-2 text-[11px] font-medium leading-snug text-[var(--accent)]">{state.statusText}</p>
      )}

      {state.agentSteps.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          {state.agentSteps.map((step, idx) => {
            const isDone = step.status === "done";
            const isErr = step.status === "error";
            const isRunning = step.status === "running";
            return (
              <div key={`${step.name}-${idx}`} className="flex items-center gap-2 text-[11px]">
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
          })}
        </div>
      )}

      {state.planResult && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />
            <span className="text-[13px] font-bold text-[var(--text-primary)]">
              {state.planResult.projectName || "Plan Updated"}
            </span>
            {state.planResult.wikiPageUrl && (
              <a href={state.planResult.wikiPageUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:underline">
                <FileText className="h-3 w-3" /> Wiki
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Tasks", value: state.planResult.taskCount ?? 0, color: "" },
              { label: "Milestones", value: state.planResult.milestoneCount ?? 0, color: "" },
              { label: "Conflicts", value: state.planResult.conflictCount ?? 0, color: (state.planResult.conflictCount ?? 0) > 0 ? "text-[var(--warning)]" : "" },
              { label: "Critique", value: state.planResult.critiqueScore != null ? `${state.planResult.critiqueScore}/10` : "-", color: "" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2 text-center">
                <div className={`text-base font-black text-[var(--text-primary)] ${item.color}`}>{item.value}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-widest text-[var(--text-muted)]">{item.label}</div>
              </div>
            ))}
          </div>

          {state.planResult.risk && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                <span>Risk Score</span>
                <span className={riskColor(state.planResult.risk.score)}>{state.planResult.risk.score}/100</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                <div
                  className={`h-full rounded-full ${
                    state.planResult.risk.score <= 30 ? "bg-[var(--success)]" :
                    state.planResult.risk.score <= 60 ? "bg-[var(--warning)]" : "bg-[var(--danger)]"
                  }`}
                  style={{ width: `${state.planResult.risk.score}%` }}
                />
              </div>
            </div>
          )}

          {state.planResult.risk?.suggestions?.length ? (
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Mitigations</p>
              {state.planResult.risk.suggestions.slice(0, 3).map((suggestion, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <Shield className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent)]" />
                  {suggestion}
                </div>
              ))}
            </div>
          ) : null}

          {state.planResult.knowledgeGaps?.length ? (
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Knowledge Gaps</p>
              {state.planResult.knowledgeGaps.slice(0, 3).map((gap, idx) => (
                <div key={idx} className="rounded-lg border border-[var(--warning)]/10 bg-[var(--warning)]/5 px-2.5 py-1.5 text-[11px] text-[var(--warning)]">
                  {gap}
                </div>
              ))}
            </div>
          ) : null}

          <button
            onClick={onOpenProject}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[12px] font-bold text-[var(--bg-950)] transition-opacity hover:opacity-90"
          >
            Open Project
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
