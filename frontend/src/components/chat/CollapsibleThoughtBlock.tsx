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
      const timer = setTimeout(() => setExpanded(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, thoughtText]);

  if (!thoughtText.trim()) return null;

  return (
    <div className={cn("my-1.5 w-full", className)}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors select-none"
      >
        <Brain
          className={cn(
            "w-3 h-3 shrink-0 transition-colors",
            isStreaming
              ? "text-[var(--accent)] animate-pulse"
              : "text-[var(--text-dim)]"
          )}
        />
        <span>{isStreaming ? "Thinking..." : expanded ? "Hide reasoning" : "Show reasoning"}</span>
        {isStreaming && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            expanded ? "rotate-180" : ""
          )}
        />
      </button>

      {expanded && (
        <div className="mt-1.5 p-3 rounded-lg bg-[var(--bg-800)] border border-[var(--border-subtle)]">
          <p className="text-[11px] leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap font-mono max-h-64 overflow-y-auto custom-scrollbar">
            {thoughtText}
          </p>
        </div>
      )}
    </div>
  );
}
