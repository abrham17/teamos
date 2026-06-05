"use client";

import { BrainCircuit } from "lucide-react";
import type { AgentStrategy } from "./chatTypes";

interface IntentAcknowledgmentCardProps {
  strategy: AgentStrategy;
  onCorrectRoute: (mode: "ask" | "agent" | "research") => void;
  collapsed: boolean;
  canRoute?: boolean;
}

export function IntentAcknowledgmentCard({
  strategy,
  onCorrectRoute,
  collapsed,
  canRoute = true,
}: IntentAcknowledgmentCardProps) {
  if (collapsed) return null;

  const {
    primary_agent,
    reasoning_depth,
    confidence,
  } = strategy;

  const getAgentLabel = (agent: string) => {
    switch (agent) {
      case "strategic_planner":
      case "planner":
        return "strategic_planner";
      case "researcher":
      case "research":
        return "researcher";
      case "lightweight":
        return "lightweight";
      default:
        return agent;
    }
  };

  return (
    <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] select-none flex-wrap py-1">
      <BrainCircuit className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
      <span className="font-semibold text-[var(--text-primary)]">{getAgentLabel(primary_agent)}</span>
      <span className="text-[var(--text-dim)]">·</span>
      <span>{reasoning_depth}</span>
      <span className="text-[var(--text-dim)]">·</span>
      <span>{(confidence * 100).toFixed(0)}% confident</span>

      {canRoute && (
        <>
          <span className="text-[var(--text-dim)] ml-1">|</span>
          <span className="text-[10px] text-[var(--text-dim)]">Not what you meant?</span>
          <div className="flex items-center gap-1.5">
            {primary_agent !== "lightweight" && (
              <button
                onClick={() => onCorrectRoute("ask")}
                className="text-[10px] text-[var(--accent)] hover:underline font-medium cursor-pointer bg-transparent border-none p-0"
              >
                Use ask mode
              </button>
            )}
            {primary_agent !== "planner" && primary_agent !== "strategic_planner" && (
              <button
                onClick={() => onCorrectRoute("agent")}
                className="text-[10px] text-[var(--accent)] hover:underline font-medium cursor-pointer bg-transparent border-none p-0"
              >
                Use agent mode
              </button>
            )}
            {primary_agent !== "researcher" && primary_agent !== "research" && (
              <button
                onClick={() => onCorrectRoute("research")}
                className="text-[10px] text-[var(--accent)] hover:underline font-medium cursor-pointer bg-transparent border-none p-0"
              >
                Use research mode
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
