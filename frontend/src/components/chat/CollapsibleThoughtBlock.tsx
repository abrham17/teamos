"use client";

import { useState, useEffect } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleThoughtBlockProps {
  thoughtText: string;
  isStreaming?: boolean;
  className?: string;
}

export function CollapsibleThoughtBlock({
  thoughtText,
  isStreaming = false,
  className,
}: CollapsibleThoughtBlockProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      setExpanded(true);
    } else if (!isStreaming && thoughtText.trim()) {
      const timer = setTimeout(() => setExpanded(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, thoughtText]);

  if (!thoughtText.trim()) return null;

  return (
    <div className={cn("my-2 w-full border border-[var(--border-subtle)] rounded-xl overflow-hidden", className)}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-800)]/30 transition-colors select-none text-left"
      >
        <div className="flex items-center gap-2">
          <Brain
            className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors",
              isStreaming
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)]"
            )}
          />
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            {isStreaming ? "Thinking..." : "Thought Process"}
          </span>
          {isStreaming && (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-[var(--text-dim)] transition-transform duration-200",
            expanded ? "rotate-180" : ""
          )}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-[11px] leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap font-mono max-h-48 overflow-y-auto custom-scrollbar">
            {thoughtText}
          </p>
        </div>
      )}
    </div>
  );
}
