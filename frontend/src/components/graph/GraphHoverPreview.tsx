"use client";

import type { GraphEdge, GraphNode } from "./CytoscapeViewer";

const NODE_TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  standard: { bg: "rgba(0, 212, 232, 0.12)", text: "#00d4e8", border: "rgba(0, 212, 232, 0.35)" },
  meeting: { bg: "rgba(168, 85, 247, 0.12)", text: "#a855f7", border: "rgba(168, 85, 247, 0.35)" },
  decision: { bg: "rgba(249, 115, 22, 0.12)", text: "#f97316", border: "rgba(249, 115, 22, 0.35)" },
  incident: { bg: "rgba(239, 68, 68, 0.12)", text: "#ef4444", border: "rgba(239, 68, 68, 0.35)" },
  template: { bg: "rgba(34, 197, 94, 0.12)", text: "#22c55e", border: "rgba(34, 197, 94, 0.35)" },
};

const EDGE_COLORS: Record<string, string> = {
  wikilink: "#00d4e8",
  ai_inferred: "#a855f7",
  semantic: "#c084fc",
  manual: "#22c55e",
  citation: "#fbbf24",
};

function edgeRelationshipBlurb(edgeType: string | undefined, createdBy?: string): string {
  const t = edgeType ?? "wikilink";
  if (t === "wikilink") return "Explicit [[wikilink]] in wiki content";
  if (t === "semantic" || t === "ai_inferred") {
    return createdBy === "pipeline"
      ? "Suggested from ingested page text (vector similarity)"
      : "Semantic link between wiki pages";
  }
  if (t === "citation") return "Citation-style link";
  if (t === "manual") return "Manually added graph edge";
  return "Relationship between two wiki pages";
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export type GraphHoverPreviewResolved =
  | {
      kind: "node";
      node: GraphNode;
      degree: number;
    }
  | {
      kind: "edge";
      edge: GraphEdge;
      sourceTitle: string;
      targetTitle: string;
    };

interface Props {
  resolved: GraphHoverPreviewResolved | null;
}

export function GraphHoverPreview({ resolved }: Props) {
  if (!resolved) return null;

  const motionSafe =
    "motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none";

  if (resolved.kind === "node") {
    const { node, degree } = resolved;
    const typeStyle = NODE_TYPE_STYLES[node.type ?? "standard"] ?? NODE_TYPE_STYLES.standard;
    const summary = node.summary?.trim();

    return (
      <div
        className={`pointer-events-none absolute bottom-6 left-1/2 z-[12] w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 opacity-100 ${motionSafe}`}
        role="status"
        aria-live="polite"
      >
        <div
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--glass-heavy-bg)]/95 px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-md"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: typeStyle.text,
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize"
              style={{
                background: typeStyle.bg,
                color: typeStyle.text,
                border: `1px solid ${typeStyle.border}`,
              }}
            >
              {node.type ?? "standard"}
            </span>
            <span className="text-[10px] text-[var(--text-dim)]">
              {degree} connection{degree === 1 ? "" : "s"}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">{node.title}</h3>
          {summary ? (
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">{truncate(summary, 220)}</p>
          ) : (
            <p className="mt-1.5 text-xs italic text-[var(--text-dim)]">No summary yet — open the page in the wiki to add context.</p>
          )}
          {node.updated_at ? (
            <p className="mt-2 text-[10px] text-[var(--text-dim)]">Updated {formatDate(node.updated_at)}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const ec = EDGE_COLORS[resolved.edge.type ?? "wikilink"] ?? EDGE_COLORS.wikilink;
  const conf = resolved.edge.confidence;

  return (
    <div
      className={`pointer-events-none absolute bottom-6 left-1/2 z-[12] w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 opacity-100 ${motionSafe}`}
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--glass-heavy-bg)]/95 px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: ec, background: `${ec}22`, border: `1px solid ${ec}44` }}
          >
            {(resolved.edge.type ?? "wikilink").replace("_", " ")}
          </span>
          {typeof conf === "number" && (resolved.edge.type ?? "wikilink") !== "wikilink" ? (
            <span className="text-[10px] text-[var(--text-dim)]">Strength {(conf <= 1 ? conf * 100 : conf).toFixed(0)}%</span>
          ) : null}
          {resolved.edge.created_by ? (
            <span className="text-[10px] text-[var(--text-dim)] capitalize">{resolved.edge.created_by}</span>
          ) : null}
        </div>
        <p className="mt-2 text-sm font-medium text-[var(--text-primary)] leading-snug">
          <span className="text-[var(--text-secondary)]">{truncate(resolved.sourceTitle, 48)}</span>
          <span className="mx-1.5 text-[var(--accent)]">→</span>
          <span className="text-[var(--text-secondary)]">{truncate(resolved.targetTitle, 48)}</span>
        </p>
        <p className="mt-1 text-[10px] text-[var(--text-dim)]">
          {edgeRelationshipBlurb(resolved.edge.type, resolved.edge.created_by)}
        </p>
      </div>
    </div>
  );
}
