"use client";

import { X, ExternalLink, Calendar, Hash, Link2 } from "lucide-react";
import type { GraphNode } from "./CytoscapeViewer";

/* ── Color maps ── */
const NODE_TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  standard: { bg: "rgba(0, 212, 232, 0.1)",   text: "#00d4e8", border: "rgba(0, 212, 232, 0.3)"   },
  meeting:  { bg: "rgba(168, 85, 247, 0.1)",   text: "#a855f7", border: "rgba(168, 85, 247, 0.3)"  },
  decision: { bg: "rgba(249, 115, 22, 0.1)",   text: "#f97316", border: "rgba(249, 115, 22, 0.3)"  },
  incident: { bg: "rgba(239, 68, 68, 0.1)",    text: "#ef4444", border: "rgba(239, 68, 68, 0.3)"   },
  template: { bg: "rgba(34, 197, 94, 0.1)",    text: "#22c55e", border: "rgba(34, 197, 94, 0.3)"   },
};

const EDGE_COLORS: Record<string, string> = {
  wikilink:    "#00d4e8",
  ai_inferred: "#a855f7",
  manual:      "#22c55e",
};

export interface LinkedNode extends GraphNode {
  edgeType: string;
}

interface Props {
  node:           GraphNode | null | undefined;
  linkedNodes:    LinkedNode[];
  onClose:        () => void;
  onOpenEditor:   (slug: string) => void;
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function NodeInspector({ node, linkedNodes, onClose, onOpenEditor }: Props) {
  const typeStyle = node
    ? (NODE_TYPE_STYLES[node.type ?? "standard"] ?? NODE_TYPE_STYLES.standard)
    : null;

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-72 flex flex-col bg-[var(--surface-1)] border-l border-[var(--border-subtle)] overflow-hidden z-10"
      style={{
        transform: node ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.25,1.2,0.4,1)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex-1 min-w-0">
          {node && typeStyle && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold mb-2 capitalize"
              style={{ background: typeStyle.bg, color: typeStyle.text, border: `1px solid ${typeStyle.border}` }}
            >
              {node.type ?? "standard"}
            </span>
          )}
          <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
            {node?.title ?? ""}
          </h3>
        </div>
        <button
          onClick={onClose}
          title="Close"
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors shrink-0 mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {node && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

          {/* ── Metadata ── */}
          <div className="flex flex-col gap-1.5">
            {node.updated_at && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Updated {formatDate(node.updated_at)}</span>
              </div>
            )}
            {node.slug && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Hash className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono opacity-70">{node.slug}</span>
              </div>
            )}
          </div>

          {/* ── Summary ── */}
          {node.summary && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-2">
                Summary
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {node.summary}
              </p>
            </div>
          )}

          {/* ── Open in editor ── */}
          {node.slug && (
            <button
              onClick={() => onOpenEditor(node.slug!)}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-[var(--accent-subtle)] border border-[var(--border-subtle)] text-[var(--accent)] text-sm font-medium hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-950)] transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Editor
            </button>
          )}

          {/* ── Linked pages ── */}
          {linkedNodes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                  Linked Pages ({linkedNodes.length})
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                {linkedNodes.map((n, i) => {
                  const ec = EDGE_COLORS[n.edgeType] ?? EDGE_COLORS.wikilink;
                  return (
                    <button
                      key={`${n.id}-${i}`}
                      onClick={() => n.slug && onOpenEditor(n.slug)}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-left group w-full"
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ec }} />
                      <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors flex-1 truncate">
                        {n.title}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ color: ec, background: `${ec}18` }}
                      >
                        {n.edgeType.replace("_", " ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
