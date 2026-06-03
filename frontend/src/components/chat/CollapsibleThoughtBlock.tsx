"use client";

import { useState, useEffect, useMemo } from "react";
import { Brain, ChevronDown, Lightbulb, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface CollapsibleThoughtBlockProps {
  thoughtText: string;
  isStreaming?: boolean;
  className?: string;
}

/** Extract a one-sentence summary from raw reasoning text */
function extractSummary(text: string): string {
  if (!text.trim()) return "";
  // Try to get the first meaningful sentence (>15 chars)
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
  return sentences[0] ?? text.slice(0, 120).trim();
}

/** Extract key decision bullet points from raw reasoning text */
function extractDecisionPoints(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // Look for lines that indicate decisions / tool usage
  const decisionPatterns = [
    /^(decided|choosing|selected|using|retriev|search|consid|reject|found|will|plan|think|observ)/i,
    /^[-*•]\s/,
    /^\d+\.\s/,
  ];
  const points = lines.filter((l) =>
    decisionPatterns.some((p) => p.test(l))
  );
  return points.slice(0, 8);
}

// Layer type: 0 = collapsed to title only, 1 = summary, 2 = key decisions, 3 = full raw
type Layer = 0 | 1 | 2 | 3;

export function CollapsibleThoughtBlock({
  thoughtText,
  isStreaming = false,
  className,
}: CollapsibleThoughtBlockProps) {
  const [layer, setLayer] = useState<Layer>(isStreaming ? 1 : 0);

  // Auto-collapse after streaming ends
  useEffect(() => {
    if (isStreaming) {
      setLayer(1);
    } else if (!isStreaming && thoughtText.trim()) {
      const timer = setTimeout(() => setLayer(0), 900);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, thoughtText]);

  const summary = useMemo(() => extractSummary(thoughtText), [thoughtText]);
  const decisions = useMemo(() => extractDecisionPoints(thoughtText), [thoughtText]);

  if (!thoughtText.trim()) return null;

  const cycleLayer = () => {
    setLayer((prev) => {
      if (prev === 0) return 1;
      if (prev === 1) return 2;
      if (prev === 2) return 3;
      return 0;
    });
  };

  return (
    <div className={cn("my-2 w-full", className)}>
      {/* ── Section 7: Mobile – collapsed to single link by default ─────────── */}
      <div className="md:hidden">
        <button
          onClick={cycleLayer}
          className="text-[11px] text-[var(--text-dim)] hover:text-[var(--accent)] underline underline-offset-2 transition-colors select-none"
        >
          {layer === 0 ? "See reasoning" : "Hide reasoning"}
        </button>
        {layer >= 1 && (
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)] italic pl-3 border-l-2 border-[var(--accent)]/40">
            {summary}
          </p>
        )}
      </div>
      {/* ── Desktop – full 3-layer progressive disclosure ─────────────────── */}
      <div className="hidden md:block">
      {/* Header toggle */}
      <button
        onClick={cycleLayer}
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
        <span>
          {isStreaming
            ? "Thinking..."
            : layer === 0
            ? "Thought process"
            : layer === 1
            ? "Summary"
            : layer === 2
            ? "Key decisions"
            : "Full trace"}
        </span>
        {isStreaming && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
        )}
        {!isStreaming && (
          <span className="text-[9px] text-[var(--text-dim)] ml-1">
            {layer === 0 ? "· click to expand" : layer < 3 ? "· click for more" : "· click to collapse"}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 ml-0.5 transition-transform duration-200",
            layer === 0 ? "" : "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {/* Layer 1: Summary sentence */}
        {layer >= 1 && (
          <motion.div
            key="layer1"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 pl-4 border-l-2 border-[var(--accent)]/40">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Lightbulb className="w-2.5 h-2.5 text-[var(--accent)]" />
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">
                  Summary
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--text-secondary)] italic">
                {isStreaming ? thoughtText.slice(-180) : summary}
              </p>
            </div>
          </motion.div>
        )}

        {/* Layer 2: Key decisions */}
        {layer >= 2 && decisions.length > 0 && (
          <motion.div
            key="layer2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-4 border-l-2 border-purple-500/30">
              <div className="flex items-center gap-1.5 mb-1">
                <Eye className="w-2.5 h-2.5 text-purple-400" />
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">
                  Key Decisions
                </span>
              </div>
              <ul className="space-y-0.5">
                {decisions.map((point, i) => (
                  <li key={i} className="text-[11px] text-[var(--text-dim)] leading-relaxed flex gap-1.5">
                    <span className="text-purple-400/60 shrink-0">·</span>
                    <span>{point.replace(/^[-*•\d.]\s*/, "")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}

        {/* Layer 3: Full raw trace */}
        {layer === 3 && (
          <motion.div
            key="layer3"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-4 border-l-2 border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="w-2.5 h-2.5 text-[var(--text-dim)]" />
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">
                  Full Trace
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--text-dim)] italic whitespace-pre-wrap font-mono max-h-64 overflow-y-auto custom-scrollbar">
                {thoughtText}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>{/* end desktop wrapper */}
    </div>
  );
}
