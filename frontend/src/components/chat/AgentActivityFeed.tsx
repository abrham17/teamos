"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, AlertCircle, Brain, Wrench, ChevronDown } from "lucide-react";
import type { ActivityEntry } from "./chatTypes";

interface AgentActivityFeedProps {
  entries: ActivityEntry[];
  isRunning: boolean;
}

export function AgentActivityFeed({ entries, isRunning }: AgentActivityFeedProps) {
  const [collapsedThinking, setCollapsedThinking] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) return null;

  const completedCount = entries.filter((e) => e.status === "done").length;
  const totalCount = entries.filter((e) => e.kind !== "thinking").length;
  const hasRunning = entries.some((e) => e.status === "running");

  const toggleThinking = (id: string) => {
    setCollapsedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getIcon = (entry: ActivityEntry) => {
    if (entry.status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />;
    if (entry.status === "error") return <AlertCircle className="h-3.5 w-3.5 text-[var(--danger)]" />;
    if (entry.status === "done") return <Check className="h-3.5 w-3.5 text-[var(--success)]" />;
    return <div className="h-1.5 w-1.5 rounded-full bg-[var(--text-dim)]" />;
  };

  const getKindIcon = (kind: ActivityEntry["kind"]) => {
    switch (kind) {
      case "thinking": return <Brain className="h-3 w-3" />;
      case "tool": return <Wrench className="h-3 w-3" />;
      default: return null;
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-950)]/70 shadow-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isRunning || hasRunning ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--success)]"}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {isRunning || hasRunning ? "Agent Activity" : "Activity Feed"}
          </span>
          {totalCount > 0 && (
            <span className="text-[10px] text-[var(--text-dim)]">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
        {(isRunning || hasRunning) && (
          <span className="text-[10px] text-[var(--accent)] flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Working...
          </span>
        )}
      </div>

      {/* Progress Bar — only show when running */}
      {(isRunning || hasRunning) && totalCount > 0 && (
        <div className="h-1 overflow-hidden bg-[var(--border-subtle)]">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-600"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / totalCount) * 100}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      )}

      {/* Entries */}
      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            const isThinkingKind = entry.kind === "thinking";
            const isCollapsed = isThinkingKind && collapsedThinking.has(entry.id);
            const isDone = entry.status === "done";
            const isErr = entry.status === "error";
            const isRunning = entry.status === "running";

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`rounded-xl border overflow-hidden ${
                  isErr
                    ? "border-[var(--danger)]/20 bg-[var(--danger)]/5"
                    : isThinkingKind
                    ? "border-[var(--border-subtle)] bg-[var(--surface-1)]/30"
                    : "border-[var(--border-subtle)] bg-[var(--surface-1)]/50"
                }`}
              >
                <button
                  onClick={() => isThinkingKind && toggleThinking(entry.id)}
                  className={`w-full flex items-start gap-3 p-3 text-left transition-colors ${
                    isThinkingKind ? "hover:bg-[var(--surface-1)]/50 cursor-pointer" : "cursor-default"
                  }`}
                >
                  {/* Status icon */}
                  <span className="mt-0.5 shrink-0">
                    {getIcon(entry)}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {getKindIcon(entry.kind) && (
                        <span className="text-[var(--text-dim)]">
                          {getKindIcon(entry.kind)}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${
                        isErr ? "text-[var(--danger)]" :
                        isRunning ? "text-[var(--accent)]" :
                        isThinkingKind ? "text-[var(--text-dim)]" :
                        "text-[var(--text-dim)]"
                      }`}>
                        {entry.kind === "thinking" ? "Thought" : 
                         entry.kind === "tool" ? "Tool" : "Status"}
                      </span>
                      <span className="text-[9px] text-[var(--text-dim)] ml-auto">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      {isThinkingKind && (
                        <ChevronDown className={`h-3 w-3 text-[var(--text-dim)] transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
                      )}
                    </div>

                    <p className={`text-[12px] leading-relaxed ${
                      isDone ? "text-[var(--text-secondary)]" :
                      isRunning ? "text-[var(--text-primary)] font-medium" :
                      isErr ? "text-[var(--danger)]" :
                      isThinkingKind ? "text-[var(--text-dim)] italic" :
                      "text-[var(--text-secondary)]"
                    } ${isCollapsed ? "line-clamp-1" : ""}`}>
                      {entry.message}
                    </p>

                    {/* Expanded details for status entries */}
                    {!isCollapsed && entry.detail && Object.keys(entry.detail).length > 0 && entry.kind !== "thinking" && (
                      <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-1.5 text-[10px]">
                        {Object.entries(entry.detail).slice(0, 6).map(([key, value]) => (
                          <div key={key} className="flex flex-col">
                            <span className="text-[var(--text-dim)] uppercase tracking-wider">{key.replace(/_/g, " ")}</span>
                            <span className="text-[var(--text-primary)] font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
