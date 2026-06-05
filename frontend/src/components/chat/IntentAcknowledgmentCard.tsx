"use client";

import { motion } from "motion/react";
import { 
  Compass, 
  Brain, 
  HelpCircle, 
  Flame, 
  Zap, 
  AlertCircle, 
  ChevronRight,
  ShieldAlert,
  Cpu
} from "lucide-react";
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
  const {
    primary_agent,
    reasoning_depth,
    confidence,
    intent_type = "chat/general",
    complexity = "low",
    domains = [],
    latency_ms = 0,
    layer_used = 1,
    is_crew = false,
  } = strategy;

  // Pretty format intent type
  const formatIntent = (str: string) => {
    return str
      .split("/")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" • ");
  };

  const getAgentLabel = (agent: string, crew: boolean) => {
    if (crew) return "Operational Crew";
    switch (agent) {
      case "strategic_planner":
      case "planner":
        return "Strategic Planner";
      case "researcher":
      case "research":
        return "Research Specialist";
      case "lightweight":
        return "Lightweight Specialist";
      default:
        return "Specialist Agent";
    }
  };

  const getComplexityColor = (comp: string) => {
    switch (comp.toLowerCase()) {
      case "very_high":
      case "high":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "medium":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      default:
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    }
  };

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-950)]/40 text-[11px] text-[var(--text-muted)] select-none">
        <Compass className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 animate-spin-slow" />
        <span>
          Intent: <strong className="text-[var(--text-primary)] font-medium">{formatIntent(intent_type)}</strong>
        </span>
        <span className="text-[var(--text-dim)]">•</span>
        <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-mono ${getComplexityColor(complexity)}`}>
          {complexity}
        </span>
        <span className="text-[var(--text-dim)]">•</span>
        <span>
          Engine: <strong className="text-[var(--text-primary)] font-medium">{getAgentLabel(primary_agent, is_crew)}</strong>
        </span>
        {latency_ms > 0 && (
          <>
            <span className="text-[var(--text-dim)]">•</span>
            <span className="font-mono text-[10px] text-[var(--text-dim)]">{latency_ms}ms</span>
          </>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-2xl rounded-xl border border-[var(--border-strong)] bg-gradient-to-br from-[var(--bg-800)] to-[var(--bg-900)] p-4 shadow-xl select-none"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Header Title */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[var(--accent)] animate-pulse" />
            <h4 className="text-[13px] font-semibold text-[var(--text-primary)] tracking-wide uppercase">
              Intent Acknowledged
            </h4>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Classifier matched your query in <span className="font-mono text-white">{latency_ms || 80}ms</span> via layer {layer_used}.
          </p>
        </div>

        {/* Confidence Gauge */}
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)]">Confidence</span>
          <span className="text-xs font-mono font-bold text-[var(--accent)]">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Grid of details */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-[var(--border-subtle)]">
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1">
            Intent Type
          </span>
          <span className="text-[12px] font-medium text-[var(--text-primary)]">
            {formatIntent(intent_type)}
          </span>
        </div>

        <div>
          <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1">
            Complexity
          </span>
          <span className={`inline-block px-2 py-0.5 rounded border text-[10px] uppercase font-mono font-bold ${getComplexityColor(complexity)}`}>
            {complexity}
          </span>
        </div>

        <div>
          <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1">
            Route Strategy
          </span>
          <span className="text-[12px] font-medium text-white flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            {getAgentLabel(primary_agent, is_crew)}
          </span>
        </div>
      </div>

      {/* Domains identified */}
      {domains.length > 0 && (
        <div className="mt-3">
          <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
            Domains Identified
          </span>
          <div className="flex flex-wrap gap-1.5">
            {domains.map((dom) => (
              <span
                key={dom}
                className="px-2 py-0.5 rounded-full bg-[var(--bg-950)] text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] font-medium"
              >
                {dom}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Correction Chips */}
      {canRoute && (
        <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Not what you meant? Force correct routing:</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onCorrectRoute("ask")}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-950)] hover:bg-[var(--bg-700)] text-[11px] text-[var(--text-primary)] transition-all text-left hover:border-[var(--accent)] cursor-pointer group"
            >
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>Lightweight Lookup</span>
              </span>
              <ChevronRight className="w-3 h-3 text-[var(--text-dim)]" />
            </button>

            <button
              onClick={() => onCorrectRoute("research")}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-950)] hover:bg-[var(--bg-700)] text-[11px] text-[var(--text-primary)] transition-all text-left hover:border-[var(--accent)] cursor-pointer group"
            >
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>Research Specialist</span>
              </span>
              <ChevronRight className="w-3 h-3 text-[var(--text-dim)]" />
            </button>


            <button
              onClick={() => onCorrectRoute("agent")}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-950)] hover:bg-[var(--bg-700)] text-[11px] text-[var(--text-primary)] transition-all text-left hover:border-[var(--accent)] cursor-pointer group"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                <span>Operational Crew</span>
              </span>
              <ChevronRight className="w-3 h-3 text-[var(--text-dim)]" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
