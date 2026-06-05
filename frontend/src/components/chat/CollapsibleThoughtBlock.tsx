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
    <div className={cn("border border-[var(--border-subtle)] rounded-xl overflow-hidden", className)}>
      <div
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
      >
        <Brain
          className={cn(
            "w-3 h-3 shrink-0 transition-colors",
            isStreaming ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
          )}
        />
        <span className="text-[11px] text-[var(--text-muted)]">Thinking</span>
        {isStreaming && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 ml-auto transition-transform duration-200 text-[var(--text-dim)]",
            expanded && "rotate-180"
          )}
        />
      </div>
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] px-3 pb-3">
          <p className="text-[11px] leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap font-mono max-h-48 overflow-y-auto mt-3">
            {thoughtText}
          </p>
        </div>
      )}
    </div>
  );
}
