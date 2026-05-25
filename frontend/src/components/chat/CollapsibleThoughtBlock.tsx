"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
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

  // Auto-collapse when streaming finishes
  useEffect(() => {
    if (isStreaming) {
      setIsCollapsed(false);
    } else if (!isStreaming && thoughtText.trim()) {
      setIsCollapsed(true);
    }
  }, [isStreaming, thoughtText]);

  if (!thoughtText.trim()) return null;

  return (
    <div
      className={cn(
        "my-3 rounded-xl border border-white/5 bg-[var(--surface-1)]/30 backdrop-blur-md overflow-hidden transition-all duration-300",
        className
      )}
    >
      {/* Header / Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-[var(--text-muted)] hover:bg-white/[0.02] transition-colors border-b border-white/[0.03]"
      >
        <div className="flex items-center gap-2">
          <Brain className={cn("w-3.5 h-3.5 text-[var(--accent)]", isStreaming && "animate-pulse")} />
          <span>
            {isStreaming ? "Thinking process..." : "Thought process"}
          </span>
          {isStreaming && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-normal opacity-60">
            {isCollapsed ? "Click to expand" : "Click to collapse"}
          </span>
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {/* Content Area */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out origin-top",
          isCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-[600px] opacity-100 overflow-y-auto"
        )}
      >
        <div className="p-4 text-xs leading-relaxed font-sans whitespace-pre-wrap text-[var(--text-secondary)] bg-black/10 border-t border-white/[0.01] max-h-[400px] overflow-y-auto custom-scrollbar italic select-none">
          {thoughtText}
        </div>
      </div>
    </div>
  );
}
