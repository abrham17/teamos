"use client";

import { Check } from "lucide-react";
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
      return <div className="w-2.5 h-2.5 rounded-full bg-[var(--success)] flex items-center justify-center shrink-0"><Check className="w-2 h-2 text-white" /></div>;
  }
}

export function CrewActivityPanel({ progress, isRunning = true }: CrewActivityPanelProps) {
  const { agents } = progress;
  const doneCount = agents.filter((a) => a.status === "done").length;

  if (!agents.length) return null;

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-transparent">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <span>Crew</span>
          {isRunning && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          )}
        </div>
        <span>
          {doneCount}/{agents.length} done
        </span>
      </div>

      <div className="divide-y divide-[var(--border-subtle)]">
        {agents.map((agent) => {
          const identity = getAgentIdentity(agent.role);
          const isDone = agent.status === "done";
          const isActive = agent.status === "executing" || agent.status === "thinking";

          return (
            <div
              key={agent.role}
              className="flex items-center gap-2.5 px-3 py-2 bg-transparent"
            >
              <AgentStatusIcon status={agent.status} />
              <span className="text-[12px] font-medium text-[var(--text-primary)] capitalize shrink-0">
                {identity.label || agent.role}
              </span>
              <span className="text-[11px] text-[var(--text-dim)] truncate max-w-[180px] ml-2">
                {isActive ? (agent.current_action || "executing...") : isDone ? "completed" : "queued"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
