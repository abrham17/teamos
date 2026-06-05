"use client";

import { Check, Loader2 } from "lucide-react";
import type { CrewProgress, CrewAgentProgress } from "./chatTypes";
import { getAgentIdentity } from "@/lib/agentIdentity";

interface CrewActivityPanelProps {
  progress: CrewProgress;
  isRunning?: boolean;
}

function AgentStatusIcon({ status }: { status: CrewAgentProgress["status"] }) {
  switch (status) {
    case "queued":
      return <div className="w-2.5 h-2.5 rounded-full border border-[var(--text-dim)] shrink-0" />;
    case "thinking":
    case "executing":
      return <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />;
    case "done":
      return <Check className="w-3 h-3 text-[var(--success)] shrink-0 font-bold" />;
  }
}

export function CrewActivityPanel({ progress, isRunning = true }: CrewActivityPanelProps) {
  const { agents } = progress;
  const doneCount = agents.filter((a) => a.status === "done").length;

  if (!agents.length) return null;

  return (
    <div className="my-2 border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-800)]/20">
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Crew
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-dim)] font-mono">
          {doneCount}/{agents.length} done
        </span>
      </div>

      {/* Agents List */}
      <div className="divide-y divide-[var(--border-subtle)]">
        {agents.map((agent) => {
          const identity = getAgentIdentity(agent.role);
          const isDone = agent.status === "done";
          const isActive = agent.status === "executing" || agent.status === "thinking";

          return (
            <div
              key={agent.role}
              className="flex items-center gap-2.5 px-3 py-2 text-left bg-transparent"
            >
              <AgentStatusIcon status={agent.status} />
              <span className="text-[12px] font-medium text-[var(--text-primary)] capitalize shrink-0">
                {identity.label}
              </span>
              <span className="text-[11px] text-[var(--text-dim)] ml-2 truncate max-w-[280px]">
                {isActive ? (agent.current_action || "executing") : isDone ? "completed" : "queued"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
