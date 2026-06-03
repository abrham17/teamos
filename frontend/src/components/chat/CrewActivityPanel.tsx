"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle,
  Loader2,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import type { CrewProgress, CrewAgentProgress } from "./chatTypes";
import { getAgentIdentity } from "@/lib/agentIdentity";

interface CrewActivityPanelProps {
  progress: CrewProgress;
  isRunning?: boolean;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function AgentStatusBadge({ status }: { status: CrewAgentProgress["status"] }) {
  switch (status) {
    case "queued":
      return (
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
          <Clock className="w-2.5 h-2.5" />
          Queued
        </span>
      );
    case "thinking":
      return (
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-400 font-semibold">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Thinking
        </span>
      );
    case "executing":
      return (
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-blue-400 font-semibold animate-pulse">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Executing
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-emerald-400 font-semibold">
          <CheckCircle className="w-2.5 h-2.5" />
          Done
        </span>
      );
  }
}

// ─── Section 7: Mobile horizontal chip strip ──────────────────────────────────
// On phones the full panel doesn't fit. Instead, show a horizontal scroll of
// compact agent status chips. Reasoning traces are still accessible via the
// CollapsibleThoughtBlock "See reasoning" link.

function MobileCrewChips({ progress }: { progress: CrewProgress }) {
  const { agents, isCompleted } = progress;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-0.5 md:hidden scrollbar-none">
      {agents.map((agent) => {
        const identity = getAgentIdentity(agent.role);
        const isDone = agent.status === "done";
        const isActive = agent.status === "executing" || agent.status === "thinking";

        return (
          <div
            key={agent.role}
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[10px] font-semibold transition-all"
            style={{
              borderColor: isActive
                ? identity.color + "60"
                : isDone
                ? "#10b98140"
                : "rgba(255,255,255,0.08)",
              background: isActive ? identity.color + "10" : isDone ? "#10b98108" : "transparent",
              color: isActive ? identity.color : isDone ? "#10b981" : "var(--text-muted)",
            }}
            title={agent.current_action ?? identity.description}
          >
            <span
              style={{
                color: isActive ? identity.color : isDone ? "#10b981" : "var(--text-dim)",
              }}
            >
              {identity.icon}
            </span>
            {identity.label}
            {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin ml-0.5" />}
            {isDone && <CheckCircle className="w-2.5 h-2.5 ml-0.5" />}
          </div>
        );
      })}
      {isCompleted && (
        <div className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 text-[10px] font-semibold text-emerald-400">
          <CheckCircle className="w-2.5 h-2.5" />
          Done
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CrewActivityPanel({ progress, isRunning = true }: CrewActivityPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const { agents, messages, isCompleted } = progress;

  const doneCount = agents.filter((a) => a.status === "done").length;

  if (!agents.length) return null;

  return (
    <>
      {/* Mobile chip strip — Section 7 */}
      <MobileCrewChips progress={progress} />

      {/* Desktop full panel */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="hidden md:block rounded-xl border border-[var(--border-strong)] bg-[var(--bg-950)]/80 overflow-hidden mb-3"
      >
        {/* Collapsed summary once all done */}
        {isCompleted && !expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2 px-3 py-1.5 w-full text-left border border-[var(--border-subtle)] bg-[var(--bg-950)]/40 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-800)] transition-colors cursor-pointer rounded-xl"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-[var(--text-primary)]">{agents.length}-agent crew</strong>{" "}
              finished —{" "}
              {agents.map((a) => getAgentIdentity(a.role).label).join(", ")}
            </span>
            <ChevronDown className="w-3 h-3 ml-auto" />
          </button>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-800)]/40">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isCompleted
                      ? "bg-emerald-400"
                      : isRunning
                      ? "bg-[var(--accent)] animate-pulse"
                      : "bg-amber-400"
                  }`}
                />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {isCompleted ? "Crew Finished" : "Crew Activity"}
                </span>
                <span className="text-[10px] text-[var(--text-dim)]">
                  {doneCount}/{agents.length}
                </span>
              </div>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
                aria-label={expanded ? "Collapse crew panel" : "Expand crew panel"}
              >
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-[var(--border-subtle)] overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[var(--accent)] via-purple-500 to-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${(doneCount / agents.length) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 space-y-1.5">
                    {agents.map((agent, idx) => {
                      const identity = getAgentIdentity(agent.role);
                      const isDone = agent.status === "done";
                      const isActive =
                        agent.status === "executing" || agent.status === "thinking";

                      const incomingMsgs = messages.filter((m) => m.to === agent.role);

                      return (
                        <div key={agent.role}>
                          {/* Inter-agent handoff arrow */}
                          {incomingMsgs.map((msg, mi) => (
                            <div key={mi} className="flex items-start gap-2 pl-8 pb-1">
                              <ArrowRight
                                className="w-3 h-3 mt-0.5 shrink-0"
                                style={{ color: getAgentIdentity(msg.from).color }}
                              />
                              <span className="text-[10px] text-[var(--text-dim)] italic leading-relaxed">
                                <span
                                  className="font-medium not-italic"
                                  style={{ color: getAgentIdentity(msg.from).color }}
                                >
                                  {getAgentIdentity(msg.from).label}
                                </span>
                                {" → "}
                                {msg.content.slice(0, 120)}
                                {msg.content.length > 120 ? "…" : ""}
                              </span>
                            </div>
                          ))}

                          {/* Agent row */}
                          <motion.div
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.06 }}
                            className={`flex items-start gap-3 px-3 py-2 rounded-lg border transition-all ${
                              isActive
                                ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                                : isDone
                                ? "border-emerald-500/20 bg-emerald-500/5"
                                : "border-[var(--border-subtle)] bg-transparent"
                            }`}
                          >
                            <div
                              className={`mt-0.5 shrink-0 ${isActive ? "animate-pulse" : ""}`}
                              style={{ color: identity.color }}
                              title={identity.description}
                            >
                              {identity.icon}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span
                                  className="text-[11px] font-semibold"
                                  style={{ color: identity.color }}
                                >
                                  {identity.label}
                                </span>
                                <AgentStatusBadge status={agent.status} />
                              </div>
                              <p className="text-[11px] text-[var(--text-dim)] leading-relaxed truncate">
                                {agent.current_action ?? "Waiting..."}
                              </p>
                            </div>
                          </motion.div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    </>
  );
}
