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
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      setIsCollapsed(false);
    } else if (!isStreaming && thoughtText.trim()) {
      const timer = setTimeout(() => setIsCollapsed(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, thoughtText]);

  if (!thoughtText.trim()) return null;

  return (
    <div className={cn("my-1 w-full", className)}>
      <button
        onClick={() => setIsCollapsed((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors group select-none"
      >
        <Brain
          className={cn(
            "w-3 h-3 shrink-0 transition-colors",
            isStreaming
              ? "text-[var(--accent)] animate-pulse"
              : "text-[var(--text-dim)] group-hover:text-[var(--text-muted)]"
          )}
        />
        <span>{isStreaming ? "Thinking..." : "Thought process"}</span>
        {isStreaming && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 ml-0.5 transition-transform duration-200",
            isCollapsed ? "" : "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
        )}
      >
        <p className="mt-1.5 pl-4 border-l border-[var(--border-subtle)] text-[11px] leading-relaxed text-[var(--text-dim)] italic whitespace-pre-wrap font-sans select-none">
          {thoughtText}
        </p>
      </div>
    </div>
  );
}
