"use client";

import { X, ExternalLink, Calendar, Crosshair, Hash, Link2 } from "lucide-react";
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
  semantic:    "#c084fc",
  manual:      "#22c55e",
  citation:    "#fbbf24",
};

export interface LinkedNode extends GraphNode {
  edgeId: string;
  edgeType: string;
  edgeConfidence?: number;
  edgeCreatedBy?: string;
}

function edgeGroup(edgeType: string): "wiki" | "ingest" | "other" {
  if (edgeType === "wikilink") return "wiki";
  if (edgeType === "semantic" || edgeType === "ai_inferred") return "ingest";
  return "other";
}

function edgeTypeLabel(edgeType: string): string {
  const map: Record<string, string> = {
    wikilink: "Wiki link",
    semantic: "Related (ingest)",
    ai_inferred: "Related (AI)",
    manual: "Manual",
    citation: "Citation",
  };
  return map[edgeType] ?? edgeType.replace(/_/g, " ");
}

interface Props {
  node:                 GraphNode | null | undefined;
  linkedNodes:          LinkedNode[];
  onClose:              () => void;
  onOpenEditor:         (slug: string) => void;
  /** Focus this node on the graph (center / select). */
  onSelectLinkedNode?:  (id: string) => void;
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

export function NodeInspector({ node, linkedNodes, onClose, onOpenEditor, onSelectLinkedNode }: Props) {
  const typeStyle = node
    ? (NODE_TYPE_STYLES[node.type ?? "standard"] ?? NODE_TYPE_STYLES.standard)
    : null;

  const wikiLinks = linkedNodes.filter((n) => edgeGroup(n.edgeType) === "wiki");
  const ingestLinks = linkedNodes.filter((n) => edgeGroup(n.edgeType) === "ingest");
  const otherLinks = linkedNodes.filter((n) => edgeGroup(n.edgeType) === "other");

  return (
    <div
      className="absolute right-0 top-0 bottom-0 z-10 flex w-72 flex-col overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--surface-1)] transition-transform duration-300 ease-[cubic-bezier(0.25,1.2,0.4,1)] motion-reduce:transition-none motion-reduce:duration-0"
      style={{
        transform: node ? "translateX(0)" : "translateX(100%)",
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

          {/* ── Linked pages (wiki vs ingest / other) ── */}
          {linkedNodes.length > 0 && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                  Connections ({linkedNodes.length})
                </p>
              </div>

              {([
                { key: "wiki", title: "Wiki links", subtitle: "From [[wikilinks]] in page text", items: wikiLinks },
                {
                  key: "ingest",
                  title: "Related (ingest)",
                  subtitle: "Vector similarity after save — same team pages",
                  items: ingestLinks,
                },
                { key: "other", title: "Other links", subtitle: "Manual or citation edges", items: otherLinks },
              ] as const)
                .filter((s) => s.items.length > 0)
                .map((section) => (
                  <div key={section.key}>
                    <p className="text-[11px] font-semibold text-[var(--text-primary)] mb-0.5">{section.title}</p>
                    <p className="text-[10px] text-[var(--text-dim)] mb-2">{section.subtitle}</p>
                    <div className="flex flex-col gap-1.5">
                      {section.items.map((n) => {
                        const ec = EDGE_COLORS[n.edgeType] ?? EDGE_COLORS.wikilink;
                        const conf = n.edgeConfidence;
                        const showStrength =
                          typeof conf === "number" && n.edgeType !== "wikilink";
                        const ingestMeta =
                          section.key === "ingest" && n.edgeCreatedBy
                            ? n.edgeCreatedBy === "pipeline"
                              ? "Ingest pipeline"
                              : n.edgeCreatedBy
                            : "";
                        const showMetaRow = showStrength || Boolean(ingestMeta);
                        return (
                          <div key={n.edgeId} className="flex gap-1 items-stretch">
                            <button
                              type="button"
                              onClick={() => onSelectLinkedNode?.(n.id)}
                              className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg bg-[var(--surface-2)] p-2.5 text-left transition-colors hover:bg-[var(--surface-3)] group"
                              title="Show on graph"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Crosshair className="h-3.5 w-3.5 shrink-0 text-[var(--text-dim)] group-hover:text-[var(--accent)]" />
                                <div className="w-2 h-2 shrink-0 rounded-full" style={{ background: ec }} />
                                <span className="truncate text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                                  {n.title}
                                </span>
                                <span
                                  className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize"
                                  style={{ color: ec, background: `${ec}18` }}
                                >
                                  {edgeTypeLabel(n.edgeType)}
                                </span>
                              </div>
                              {showMetaRow ? (
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[10px] text-[var(--text-dim)]">
                                  {showStrength ? (
                                    <span>
                                      Strength {(conf! <= 1 ? conf! * 100 : conf!).toFixed(0)}%
                                    </span>
                                  ) : null}
                                  {ingestMeta ? <span>{ingestMeta}</span> : null}
                                </div>
                              ) : null}
                            </button>
                            {n.slug ? (
                              <button
                                type="button"
                                title="Open in wiki"
                                onClick={() => onOpenEditor(n.slug!)}
                                className="flex shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
