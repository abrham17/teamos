"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import type { ActivityEntry } from "./chatTypes";

interface AgentActivityFeedProps {
  entries: ActivityEntry[];
  isRunning: boolean;
}

export function AgentActivityFeed({ entries, isRunning }: AgentActivityFeedProps) {
  const [isFeedExpanded, setIsFeedExpanded] = useState(isRunning);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsFeedExpanded(isRunning);
  }, [isRunning]);

  if (entries.length === 0) return null;

  const totalCount = entries.filter((e) => e.kind !== "thinking").length;
  const hasRunning = entries.some((e) => e.status === "running");

  const toggleDetail = (id: string) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getIcon = (entry: ActivityEntry) => {
    if (entry.status === "running") return <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)] shrink-0" />;
    if (entry.status === "error") return <AlertCircle className="h-3 w-3 text-[var(--danger)] shrink-0" />;
    if (entry.status === "done") return <Check className="h-3 w-3 text-[var(--success)] shrink-0" />;
    return <div className="h-1.5 w-1.5 rounded-full bg-[var(--text-dim)] shrink-0" />;
  };

  return (
    <div className="my-2 border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-transparent">
      {/* Header */}
      <button
        onClick={() => setIsFeedExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:bg-[var(--bg-800)]/30 transition-colors select-none text-left"
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={`w-3 h-3 text-[var(--text-dim)] transition-transform duration-200 ${isFeedExpanded ? "" : "-rotate-90"}`} />
          <span className={`h-1.5 w-1.5 rounded-full ${isRunning || hasRunning ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--success)]"}`} />
          <span className="font-semibold">
            {isRunning || hasRunning ? "Running…" : `${totalCount || entries.length} steps completed`}
          </span>
        </div>
        {(isRunning || hasRunning) && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
        )}
      </button>

      {/* Entries List */}
      {isFeedExpanded && (
        <div className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {entries.map((entry) => {
            const isTool = entry.kind === "tool";
            const showDetail = expandedDetails.has(entry.id);
            const isErr = entry.status === "error";

            return (
              <div
                key={entry.id}
                className={`px-3 py-1.5 flex flex-col transition-colors ${
                  isTool ? "hover:bg-[var(--bg-800)]/20 cursor-pointer" : ""
                }`}
                onClick={() => isTool && toggleDetail(entry.id)}
              >
                <div className="flex items-center gap-2.5">
                  {getIcon(entry)}
                  <span className={`text-[12px] truncate flex-1 ${isErr ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                    {entry.message}
                  </span>
                  <span className="text-[9px] uppercase text-[var(--text-dim)] ml-auto shrink-0 font-medium select-none">
                    {entry.kind}
                  </span>
                  <span className="text-[9px] text-[var(--text-dim)] shrink-0 font-mono select-none">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>

                {isTool && showDetail && entry.detail && Object.keys(entry.detail).length > 0 && (
                  <div className="mt-1.5 pl-5 pb-1 grid grid-cols-2 gap-1.5 text-[10px] text-[var(--text-dim)] border-t border-[var(--border-subtle)]/30 pt-1.5">
                    {Object.entries(entry.detail).map(([key, value]) => (
                      <div key={key} className="flex flex-col">
                        <span className="uppercase tracking-wider font-semibold text-[8px] text-[var(--text-muted)]">{key.replace(/_/g, " ")}</span>
                        <span className="text-[var(--text-secondary)] truncate font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
