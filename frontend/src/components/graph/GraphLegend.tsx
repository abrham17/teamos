"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const NODE_TYPES = [
  { color: "#00d4e8", label: "Standard"  },
  { color: "#a855f7", label: "Meeting"   },
  { color: "#f97316", label: "Decision"  },
  { color: "#ef4444", label: "Incident"  },
  { color: "#22c55e", label: "Template"  },
];

const EDGE_TYPES = [
  { color: "#00d4e8", label: "Wikilink"    },
  { color: "#a855f7", label: "AI Inferred" },
  { color: "#22c55e", label: "Manual"      },
];

export function GraphLegend() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="absolute bottom-4 left-4 z-10 select-none">
      <div
        className="bg-[var(--glass-heavy-bg)] backdrop-blur-sm border border-[var(--border-subtle)] rounded-xl overflow-hidden"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] w-full transition-colors"
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
                {NODE_TYPES.map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Edge types */}
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                Edges
              </p>
              <div className="flex flex-col gap-1">
                {EDGE_TYPES.map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-5 h-0.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
