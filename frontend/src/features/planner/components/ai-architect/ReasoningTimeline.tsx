"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningStage } from "./types";

interface ReasoningTimelineProps {
  stages: ReasoningStage[];
  isRunning: boolean;
}

export function ReasoningTimeline({ stages, isRunning }: ReasoningTimelineProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (stages.length === 0) return null;

  const totalStages = stages.length;
  const completedStages = stages.filter((s) => s.status === "done").length;
  const progressPercent = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;

  const formatDuration = (ms?: number) => {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const toggleExpand = (stageName: string) => {
    setExpandedStage((prev) => (prev === stageName ? null : stageName));
  };

  return (
    <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-950)]/70 p-4 shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--success)]"}`} />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Reasoning Timeline
          </span>
          <span className="text-[10px] text-[var(--text-dim)]">
            {completedStages}/{totalStages} stages
          </span>
        </div>
        {isRunning && (
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--accent)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Running...</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 mb-4 overflow-hidden rounded-full bg-[var(--border-subtle)]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-purple-600"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>

      {/* Stages */}
      <div className="space-y-2">
        <AnimatePresence>
          {stages.map((stage, idx) => {
            const isDone = stage.status === "done";
            const isErr = stage.status === "error";
            const isRunning = stage.status === "running";
            const isPending = stage.status === "pending";
            const isExpanded = expandedStage === stage.name;

            return (
              <motion.div
                key={stage.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(stage.name)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--surface-1)] transition-colors"
                >
                  {/* Status Icon */}
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    isDone ? "border-[var(--success)] text-[var(--success)] bg-[var(--success)]/10" :
                    isErr ? "border-[var(--danger)] text-[var(--danger)] bg-[var(--danger)]/10" :
                    isRunning ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" :
                    "border-[var(--border-strong)] text-[var(--text-dim)]"
                  }`}>
                    {isDone && <Check className="h-3.5 w-3.5" />}
                    {isErr && <AlertCircle className="h-3.5 w-3.5" />}
                    {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isPending && <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-dim)]" />}
                  </span>

                  {/* Stage Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[12px] font-medium ${
                        isRunning ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                      }`}>
                        {stage.label || stage.name.replace(/_/g, " ")}
                      </span>
                      {stage.durationMs && (
                        <span className="text-[10px] text-[var(--text-dim)] font-mono">
                          {formatDuration(stage.durationMs)}
                        </span>
                      )}
                    </div>
                    {stage.summary && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                        {stage.summary}
                      </p>
                    )}
                  </div>

                  {/* Expand Icon */}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-dim)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--text-dim)]" />
                  )}
                </button>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && stage.metrics && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-[var(--border-subtle)] px-3 py-2 bg-[var(--bg-950)]/50"
                    >
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        {Object.entries(stage.metrics).map(([key, value]) => (
                          <div key={key} className="flex flex-col">
                            <span className="text-[var(--text-dim)] uppercase tracking-wider">{key}</span>
                            <span className="text-[var(--text-primary)] font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
