"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { GraphEdge, GraphHoverPayload, GraphNode } from "./CytoscapeViewer";

const GAP = 6;
const MARGIN = 8;

const EDGE_COLORS: Record<string, string> = {
  wikilink: "#00d4e8",
  ai_inferred: "#a855f7",
  semantic: "#c084fc",
  manual: "#22c55e",
  citation: "#fbbf24",
};

/** Aero-style blue glass panel (shared chrome) */
const aeroPanelClass =
  "rounded-lg border shadow-lg backdrop-blur-md max-w-[min(20rem,calc(100vw-2rem))] max-h-[min(18rem,42vh)] overflow-hidden flex flex-col";

const aeroPanelStyle: CSSProperties = {
  background: "rgba(30, 90, 180, 0.42)",
  borderColor: "rgba(140, 190, 255, 0.5)",
  boxShadow:
    "0 0 0 1px rgba(200, 230, 255, 0.12) inset, 0 8px 28px rgba(0, 20, 60, 0.45)",
};

const aeroTitleBarClass =
  "h-1 shrink-0 bg-gradient-to-b from-white/25 to-transparent opacity-90";

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

type BBox = { x1: number; y1: number; x2: number; y2: number };

function panelRect(left: number, top: number, w: number, h: number) {
  return { left, top, right: left + w, bottom: top + h };
}

function rectsOverlapNode(
  r: { left: number; top: number; right: number; bottom: number },
  bb: BBox,
  inflate = 4,
) {
  return !(
    r.right < bb.x1 - inflate ||
    r.left > bb.x2 + inflate ||
    r.bottom < bb.y1 - inflate ||
    r.top > bb.y2 + inflate
  );
}

/** Prefer placements near the node (few px gap), never bottom-dock to viewport. */
function placeNearNode(
  cw: number,
  ch: number,
  w: number,
  h: number,
  bb: BBox,
): { left: number; top: number } {
  const variants: Array<{ left: number; top: number }> = [
    { left: bb.x2 + GAP, top: bb.y1 - h - GAP },
    { left: bb.x1 - w - GAP, top: bb.y1 - h - GAP },
    { left: bb.x2 + GAP, top: bb.y2 + GAP },
    { left: bb.x1 - w - GAP, top: bb.y2 + GAP },
    { left: bb.x2 + GAP, top: (bb.y1 + bb.y2) / 2 - h / 2 },
    { left: bb.x1 - w - GAP, top: (bb.y1 + bb.y2) / 2 - h / 2 },
    { left: (bb.x1 + bb.x2) / 2 - w / 2, top: bb.y1 - h - GAP },
    { left: (bb.x1 + bb.x2) / 2 - w / 2, top: bb.y2 + GAP },
  ];

  for (const v of variants) {
    let left = Math.min(Math.max(v.left, MARGIN), Math.max(MARGIN, cw - w - MARGIN));
    let top = Math.min(Math.max(v.top, MARGIN), Math.max(MARGIN, ch - h - MARGIN));
    const r = panelRect(left, top, w, h);
    if (!rectsOverlapNode(r, bb, 2)) return { left, top };
  }

  let left = Math.min(bb.x2 + GAP, cw - w - MARGIN);
  let top = Math.min(bb.y1 - h - GAP, ch - h - MARGIN);
  left = Math.max(MARGIN, left);
  top = Math.max(MARGIN, top);
  return { left, top };
}

function placeNearMidpoint(
  cw: number,
  ch: number,
  w: number,
  h: number,
  mx: number,
  my: number,
): { left: number; top: number } {
  const variants: Array<{ left: number; top: number }> = [
    { left: mx + GAP, top: my + GAP },
    { left: mx - w - GAP, top: my + GAP },
    { left: mx + GAP, top: my - h - GAP },
    { left: mx - w - GAP, top: my - h - GAP },
    { left: mx - w / 2, top: my + GAP },
    { left: mx - w / 2, top: my - h - GAP },
    { left: mx + GAP, top: my - h / 2 },
    { left: mx - w - GAP, top: my - h / 2 },
  ];

  for (const v of variants) {
    const left = Math.min(Math.max(v.left, MARGIN), Math.max(MARGIN, cw - w - MARGIN));
    const top = Math.min(Math.max(v.top, MARGIN), Math.max(MARGIN, ch - h - MARGIN));
    const fits =
      left >= MARGIN &&
      top >= MARGIN &&
      left + w <= cw - MARGIN &&
      top + h <= ch - MARGIN;
    if (fits) return { left, top };
  }
  const v = variants[0];
  return {
    left: Math.min(Math.max(v.left, MARGIN), Math.max(MARGIN, cw - w - MARGIN)),
    top: Math.min(Math.max(v.top, MARGIN), Math.max(MARGIN, ch - h - MARGIN)),
  };
}

export interface GraphNodeHoverDetail {
  id: string;
  title: string;
  slug: string;
  type: string;
  summary: string;
  frontmatter: Record<string, unknown>;
  neighbors: Array<{
    page_id: string;
    title: string;
    slug: string;
    direction: string;
    type: string;
  }>;
  source_url?: string;
  content_excerpt?: string;
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
  hoverPayload: GraphHoverPayload | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Debounced node detail from GET /graph/.../nodes/:id/ */
  nodeHoverDetail: GraphNodeHoverDetail | null;
  nodeHoverDetailLoading: boolean;
}

function formatFrontmatterSnippet(fm: Record<string, unknown>): string | null {
  const keys = Object.keys(fm);
  if (keys.length === 0) return null;
  const lines = keys.slice(0, 6).map((k) => {
    const v = fm[k];
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `${k}: ${truncate(s, 80)}`;
  });
  return lines.join("\n");
}

export function GraphHoverPreview({
  resolved,
  hoverPayload,
  containerRef,
  nodeHoverDetail,
  nodeHoverDetailLoading,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!resolved || !hoverPayload || !containerRef.current || !panelRef.current) {
      setPos(null);
      return;
    }
    const root = containerRef.current;
    const el = panelRef.current;
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w === 0 || h === 0) {
      setPos(null);
      return;
    }

    if (hoverPayload.kind === "node" && resolved.kind === "node") {
      setPos(placeNearNode(cw, ch, w, h, hoverPayload.renderedBoundingBox));
      return;
    }
    if (hoverPayload.kind === "edge" && resolved.kind === "edge") {
      const { x, y } = hoverPayload.renderedMidpoint;
      setPos(placeNearMidpoint(cw, ch, w, h, x, y));
      return;
    }
    setPos(null);
  }, [resolved, hoverPayload, containerRef, nodeHoverDetail, nodeHoverDetailLoading]);

  if (!resolved || !hoverPayload) return null;

  const posStyle: CSSProperties = pos
    ? { left: pos.left, top: pos.top, opacity: 1, visibility: "visible" }
    : { left: 0, top: 0, opacity: 0, visibility: "hidden" };

  const motionSafe =
    "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none";

  const wikiHref = (slug: string) => `/wiki?page=${encodeURIComponent(slug)}`;

  if (resolved.kind === "node") {
    const { node, degree } = resolved;
    const summary = node.summary?.trim();
    const excerpt =
      nodeHoverDetail?.content_excerpt?.trim() &&
      nodeHoverDetail.content_excerpt.trim() !== summary
        ? truncate(nodeHoverDetail.content_excerpt.trim(), 480)
        : null;
    const fmSnippet = nodeHoverDetail ? formatFrontmatterSnippet(nodeHoverDetail.frontmatter) : null;
    const citationNeighbors =
      nodeHoverDetail?.neighbors?.filter((n) => n.type === "citation").slice(0, 4) ?? [];
    const wikiNeighbors =
      nodeHoverDetail?.neighbors?.filter((n) => n.type === "wikilink").slice(0, 4) ?? [];

    return (
      <div
        ref={panelRef}
        className={`pointer-events-none absolute z-[12] w-[min(20rem,calc(100%-1rem))] ${motionSafe}`}
        style={posStyle}
        role="status"
        aria-live="polite"
      >
        <div className={aeroPanelClass} style={aeroPanelStyle}>
          <div className={aeroTitleBarClass} aria-hidden />
          <div className="px-3 py-2.5 overflow-y-auto text-left space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize bg-white/15 text-white border border-white/25">
                {node.type ?? "standard"}
              </span>
              <span className="text-[9px] text-white/70">
                {degree} connection{degree === 1 ? "" : "s"}
              </span>
              {nodeHoverDetailLoading ? (
                <span className="text-[9px] text-sky-200/80">Loading…</span>
              ) : null}
            </div>
            <h3 className="text-xs font-semibold leading-snug text-white">{node.title}</h3>
            {summary ? (
              <p className="text-[11px] leading-relaxed text-white/85">{truncate(summary, 260)}</p>
            ) : (
              <p className="text-[11px] italic text-white/55">
                No summary yet — open the page in the wiki to add context.
              </p>
            )}
            {excerpt ? (
              <p className="text-[10px] leading-relaxed text-sky-100/90 border-t border-white/15 pt-2">
                {excerpt}
              </p>
            ) : null}
            {node.slug ? (
              <p className="text-[10px] font-mono text-sky-100/90 break-all">
                Wiki:{" "}
                <span className="text-white">{wikiHref(node.slug)}</span>
              </p>
            ) : null}
            {nodeHoverDetail?.source_url ? (
              <p className="text-[10px] text-sky-100/90 break-all">
                Source:{" "}
                <span className="text-white/90">{nodeHoverDetail.source_url}</span>
              </p>
            ) : null}
            {fmSnippet ? (
              <pre className="text-[9px] leading-snug text-white/75 whitespace-pre-wrap font-mono border-t border-white/10 pt-2">
                {fmSnippet}
              </pre>
            ) : null}
            {citationNeighbors.length > 0 ? (
              <div className="border-t border-white/10 pt-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/90 mb-1">
                  Citation links
                </p>
                <ul className="text-[10px] text-white/85 space-y-0.5">
                  {citationNeighbors.map((n) => (
                    <li key={`${n.page_id}-${n.direction}`} className="truncate">
                      {n.direction === "in" ? "← " : "→ "}
                      {n.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {wikiNeighbors.length > 0 ? (
              <div className="border-t border-white/10 pt-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-cyan-200/90 mb-1">
                  Wikilinks
                </p>
                <ul className="text-[10px] text-white/85 space-y-0.5">
                  {wikiNeighbors.map((n) => (
                    <li key={`${n.page_id}-${n.direction}`} className="truncate">
                      {n.direction === "in" ? "← " : "→ "}
                      {n.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {node.updated_at ? (
              <p className="text-[9px] text-white/50 pt-1">Updated {formatDate(node.updated_at)}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const ec = EDGE_COLORS[resolved.edge.type ?? "wikilink"] ?? EDGE_COLORS.wikilink;
  const conf = resolved.edge.confidence;

  return (
    <div
      ref={panelRef}
      className={`pointer-events-none absolute z-[12] w-[min(18rem,calc(100%-1rem))] ${motionSafe}`}
      style={posStyle}
      role="status"
      aria-live="polite"
    >
      <div className={aeroPanelClass} style={aeroPanelStyle}>
        <div className={aeroTitleBarClass} aria-hidden />
        <div className="px-3 py-2.5 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white border border-white/30"
              style={{ background: `${ec}33`, borderColor: `${ec}66` }}
            >
              {(resolved.edge.type ?? "wikilink").replace("_", " ")}
            </span>
            {typeof conf === "number" && (resolved.edge.type ?? "wikilink") !== "wikilink" ? (
              <span className="text-[9px] text-white/70">
                Strength {(conf <= 1 ? conf * 100 : conf).toFixed(0)}%
              </span>
            ) : null}
            {resolved.edge.created_by ? (
              <span className="text-[9px] text-white/60 capitalize">{resolved.edge.created_by}</span>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] font-medium text-white leading-snug">
            <span className="text-white/85">{truncate(resolved.sourceTitle, 44)}</span>
            <span className="mx-1 text-sky-200">→</span>
            <span className="text-white/85">{truncate(resolved.targetTitle, 44)}</span>
          </p>
          <p className="mt-1 text-[9px] text-white/65">{edgeRelationshipBlurb(resolved.edge.type, resolved.edge.created_by)}</p>
        </div>
      </div>
    </div>
  );
}
