"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { GuardianBlock } from "./chatTypes";

interface GuardianBlockCardProps {
  block: GuardianBlock;
  onNavigateSettings?: (path: string) => void;
}

export function GuardianBlockCard({ block }: GuardianBlockCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const isTier2 = block.tier === 2;

  const formatActionName = () => {
    if (block.human_action) return block.human_action;
    return block.action
      .replace(/^ext_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (dismissed) return null;

  return (
    <div
      className={`my-3 border-l-2 rounded-r-lg px-3 py-2.5 transition-all ${
        isTier2
          ? "border-red-500 bg-red-500/5"
          : "border-amber-500 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 text-[12px] font-medium ${isTier2 ? "text-red-500" : "text-amber-500"}`}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Blocked: {formatActionName()}</span>
          <span className="text-[var(--text-dim)]">•</span>
          <span className="text-[10px] text-[var(--text-dim)] font-mono">Tier {block.tier || 1}</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5 rounded"
          aria-label="Dismiss alert"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[12px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
        {block.reason}
      </p>
      {block.rephrase_suggestion && (
        <p className="mt-2 text-[11px] italic text-[var(--text-dim)] leading-relaxed">
          <span className="font-semibold not-italic">Suggestion:</span> {block.rephrase_suggestion}
        </p>
      )}
    </div>
  );
}
