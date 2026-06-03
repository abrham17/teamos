"use client";

import { motion } from "motion/react";
import {
  ShieldAlert,
  ShieldX,
  ExternalLink,
  MessageSquareText,
  AlertTriangle,
  Lock,
} from "lucide-react";
import type { GuardianBlock } from "./chatTypes";
import { getAgentIdentity } from "@/lib/agentIdentity";

interface GuardianBlockCardProps {
  block: GuardianBlock;
  onNavigateSettings?: (path: string) => void;
}

export function GuardianBlockCard({ block, onNavigateSettings }: GuardianBlockCardProps) {
  const isTier2 = block.tier === 2;

  const formatActionName = (action: string) => {
    if (block.human_action) return block.human_action;
    // Convert snake_case tool names to readable form
    return action
      .replace(/^ext_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`w-full rounded-xl border overflow-hidden my-2 ${
        isTier2
          ? "border-red-500/30 bg-gradient-to-br from-red-950/30 to-[var(--bg-900)]"
          : "border-amber-500/25 bg-gradient-to-br from-amber-950/20 to-[var(--bg-900)]"
      }`}
    >
      {/* Header stripe */}
      <div
        className={`px-4 py-2.5 flex items-center gap-3 border-b ${
          isTier2
            ? "border-red-500/20 bg-red-500/10"
            : "border-amber-500/15 bg-amber-500/8"
        }`}
      >
        <div className={isTier2 ? "text-red-400" : "text-amber-400"}>
          {isTier2 ? (
            <ShieldX className="w-4 h-4" />
          ) : (
            <ShieldAlert className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                isTier2 ? "text-red-400" : "text-amber-400"
              }`}
            >
              Guardian {isTier2 ? "Tier 2 · LLM Reviewed" : "Tier 1 · Rule-Based"}
            </span>
          </div>
          <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-0.5 truncate">
            Blocked:{" "}
            <code
              className={`text-[11px] px-1 py-0.5 rounded font-mono ${
                isTier2
                  ? "bg-red-500/15 text-red-300"
                  : "bg-amber-500/12 text-amber-300"
              }`}
            >
              {block.action}
            </code>
          </p>
          {/* Section 6.1 — Triggering agent identity chip */}
          {block.triggered_by_agent && (() => {
            const agentId = getAgentIdentity(block.triggered_by_agent);
            return (
              <span
                className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
                style={{
                  color: agentId.color,
                  borderColor: agentId.color + "40",
                  background: agentId.color + "12",
                }}
                title={agentId.description}
              >
                {agentId.icon}
                {agentId.label} flagged this
              </span>
            );
          })()}
        </div>

        {/* Lock icon for tier 2 */}
        {isTier2 && <Lock className="w-3.5 h-3.5 text-red-400/60 shrink-0" />}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Human readable action */}
        <div>
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">
            Action
          </span>
          <p className="text-[13px] font-medium text-[var(--text-primary)] mt-0.5">
            {formatActionName(block.action)}
          </p>
        </div>

        {/* Reason */}
        <div>
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">
            Reason
          </span>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
            {block.reason}
          </p>
        </div>

        {/* Tier badge */}
        {block.tier_label && (
          <div className="flex items-start gap-2">
            <AlertTriangle
              className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                isTier2 ? "text-red-400" : "text-amber-400"
              }`}
            />
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {block.tier_label}
            </p>
          </div>
        )}

        {/* Path forward */}
        {(block.settings_path || block.rephrase_suggestion) && (
          <div
            className={`mt-1 pt-3 border-t space-y-2 ${
              isTier2 ? "border-red-500/20" : "border-amber-500/15"
            }`}
          >
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">
              Path Forward
            </span>

            {block.settings_path && (
              <button
                onClick={() => onNavigateSettings?.(block.settings_path!)}
                className={`flex items-center gap-2 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors w-full text-left ${
                  isTier2
                    ? "border-red-500/20 text-red-300 hover:bg-red-500/10"
                    : "border-amber-500/20 text-amber-300 hover:bg-amber-500/10"
                }`}
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                Enable in Settings → {block.settings_path}
              </button>
            )}

            {block.rephrase_suggestion && (
              <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-800)] border border-[var(--border-subtle)]">
                <MessageSquareText className="w-3 h-3 mt-0.5 text-[var(--text-dim)] shrink-0" />
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  <span className="text-[var(--text-dim)] font-medium">Try instead: </span>
                  {block.rephrase_suggestion}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
