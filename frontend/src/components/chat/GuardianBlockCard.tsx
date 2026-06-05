"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { GuardianBlock } from "./chatTypes";

interface GuardianBlockCardProps {
  block: GuardianBlock;
  onNavigateSettings?: (path: string) => void;
}

export function GuardianBlockCard({ block }: GuardianBlockCardProps) {
  const [dismissed, setDismissed] = useState(false);

  const formatActionName = () => {
    if (block.human_action) return block.human_action;
    return block.action
      .replace(/^ext_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (dismissed) return null;

  return (
    <div className="border-l-2 border-amber-500 bg-amber-500/5 rounded-r-lg px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-amber-500">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span>Blocked: {formatActionName()}</span>
        <span className="text-[var(--text-dim)]">·  Tier {block.tier || 1}</span>
        <button
          onClick={() => setDismissed(true)}
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5 rounded shrink-0 ml-auto"
          aria-label="Dismiss alert"
        >
          ×
        </button>
      </div>
      <div className="text-[12px] text-[var(--text-muted)] mt-1">
        {block.reason}
      </div>
      {block.rephrase_suggestion && (
        <div className="mt-2 text-[11px] italic text-[var(--text-dim)]">
          Suggestion: {block.rephrase_suggestion}
        </div>
      )}
    </div>
  );
}
