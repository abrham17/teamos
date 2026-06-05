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
    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-transparent">
      <button
        onClick={() => setIsFeedExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] cursor-pointer select-none text-left"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-[var(--accent)] animate-pulse" : "bg-[var(--success)]"}`} />
        <span>
          {isRunning ? "Running…" : `${totalCount || entries.length} steps · done`}
        </span>
        {isRunning && (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-[var(--accent)] ml-auto" />
        )}
      </button>

      {isFeedExpanded && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {entries.map((entry) => {
            const isTool = entry.kind === "tool";
            const showDetail = expandedDetails.has(entry.id);
            const isErr = entry.status === "error";

            return (
              <div
                key={entry.id}
                className={`flex flex-col transition-opacity ${isTool ? "cursor-pointer" : ""}`}
                onClick={() => isTool && toggleDetail(entry.id)}
              >
                <div className="flex items-center gap-2.5 px-3 py-1.5 border-t border-[var(--border-subtle)] first:border-t-0">
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
                  <div className="px-3 pb-1.5 pl-8 grid grid-cols-2 gap-1.5 text-[10px] text-[var(--text-dim)]">
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
