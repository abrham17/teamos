"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const NODE_TYPES = [
  { color: "#00d4e8", label: "Standard", value: "standard" },
  { color: "#a855f7", label: "Meeting", value: "meeting" },
  { color: "#f97316", label: "Decision", value: "decision" },
  { color: "#ef4444", label: "Incident", value: "incident" },
  { color: "#22c55e", label: "Template", value: "template" },
];

const EDGE_TYPES = [
  { color: "#00d4e8", label: "Wiki [[link]]", hint: "from page text", value: "wikilink" },
  { color: "#c084fc", label: "Related (ingest)", hint: "vector similarity", value: "semantic" },
  { color: "#a855f7", label: "AI inferred", hint: "legacy", value: "ai_inferred" },
  { color: "#22c55e", label: "Manual", value: "manual" },
  { color: "#fbbf24", label: "Citation", value: "citation" },
];

interface Props {
  activeNodeTypes: string[];
  activeEdgeTypes: string[];
  isolateSelection: boolean;
  onToggleNodeType: (type: string) => void;
  onToggleEdgeType: (type: string) => void;
  onToggleIsolateSelection: () => void;
  onResetFilters: () => void;
}

export function GraphLegend({
  activeNodeTypes,
  activeEdgeTypes,
  isolateSelection,
  onToggleNodeType,
  onToggleEdgeType,
  onToggleIsolateSelection,
  onResetFilters,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="select-none">
      <div
        className="bg-white/[0.02] backdrop-blur-md border border-white/[0.05] rounded-2xl overflow-hidden shadow-lg"
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] w-full transition-colors bg-white/[0.01]"
        >
          <span className="uppercase tracking-wider">Legend</span>
          <ChevronDown
            className={`w-3 h-3 ml-auto transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[var(--border-subtle)]">

            {/* Node types */}
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mt-2 mb-1.5">
                Nodes
              </p>
              <div className="flex flex-col gap-1">
                {NODE_TYPES.map(({ color, label, value }) => (
                  <button
                    key={label}
                    onClick={() => onToggleNodeType(value)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                    <span className="ml-auto text-[10px] text-[var(--text-dim)]">
                      {activeNodeTypes.includes(value) ? "on" : "off"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Edge types */}
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                Edges
              </p>
              <div className="flex flex-col gap-1">
                {EDGE_TYPES.map(({ color, label, hint, value }) => (
                  <button
                    key={label}
                    onClick={() => onToggleEdgeType(value)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="w-5 h-0.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs text-[var(--text-secondary)]">
                      {label}
                      {hint ? (
                        <span className="text-[var(--text-dim)] font-normal"> — {hint}</span>
                      ) : null}
                    </span>
                    <span className="ml-auto text-[10px] text-[var(--text-dim)]">
                      {activeEdgeTypes.includes(value) ? "on" : "off"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-2">
              <button
                onClick={onToggleIsolateSelection}
                className="w-full text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors"
              >
                Isolate selected node: {isolateSelection ? "on" : "off"}
              </button>
              <button
                onClick={onResetFilters}
                className="w-full text-left text-xs text-[var(--text-dim)] hover:text-[var(--text-primary)] rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors"
              >
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
