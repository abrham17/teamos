"use client";

import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import cytoscape from "cytoscape";

/* ── Public types ─────────────────────────────────────────────────── */
export interface GraphNode {
  id: string;
  title: string;
  type?: string;
  slug?: string;
  summary?: string;
  updated_at?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type?: string;
  confidence?: number;
  /** human | pipeline | user — ingest/vector edges are usually pipeline */
  created_by?: string;
}

/** Emitted on node hover for preview UI (coordinates relative to graph container). */
export interface GraphHoverNodePayload {
  kind: "node";
  id: string;
  renderedPosition: { x: number; y: number };
  renderedBoundingBox: { x1: number; y1: number; x2: number; y2: number };
}

/** Emitted on edge hover for preview UI. */
export interface GraphHoverEdgePayload {
  kind: "edge";
  id: string;
  sourceId: string;
  targetId: string;
  renderedMidpoint: { x: number; y: number };
}

export type GraphHoverPayload = GraphHoverNodePayload | GraphHoverEdgePayload;

export interface CytoscapeRef {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  exportPng(): void;
  setLayout(name: string): void;
  highlightSearch(query: string): void;
  clearSearch(): void;
  /** Center and lightly zoom on a node (e.g. after picking a neighbor). */
  focusNode(id: string): void;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layoutName?: string;
  onNodeClick?: (id: string) => void;
  onNodeDoubleClick?: (id: string) => void;
  onNodeRightClick?: (id: string, event: MouseEvent) => void;
  /** Hover previews; cleared on background tap and debounced on mouseout. */
  onHoverChange?: (payload: GraphHoverPayload | null) => void;
}

type NodeLike = cytoscape.NodeSingular;
type EdgeLike = cytoscape.EdgeSingular;

function getLayoutOptions(name: string): cytoscape.LayoutOptions {
  if (name === "grid") {
    return {
      name,
      animate: true,
      animationDuration: 920,
      fit: true,
      padding: 80,
      spacingFactor: 1.85,
    } as unknown as cytoscape.LayoutOptions;
  }
  if (name === "circle") {
    return {
      name,
      animate: true,
      animationDuration: 920,
      fit: true,
      padding: 90,
      spacingFactor: 1.65,
    } as unknown as cytoscape.LayoutOptions;
  }
  if (name === "breadthfirst") {
    return {
      name,
      animate: true,
      animationDuration: 920,
      fit: true,
      padding: 90,
      spacingFactor: 1.6,
      directed: true,
      avoidOverlap: true,
    } as unknown as cytoscape.LayoutOptions;
  }
  if (name === "concentric") {
    return {
      name,
      animate: true,
      animationDuration: 920,
      fit: true,
      padding: 90,
      spacingFactor: 1.65,
      avoidOverlap: true,
      concentric: (node: NodeLike) => node.degree(false),
      levelWidth: () => 2,
    } as unknown as cytoscape.LayoutOptions;
  }
  return {
    name: "cose",
    animate: true,
    animationDuration: 1050,
    padding: 90,
    nodeRepulsion: () => 26000,
    idealEdgeLength: () => 245,
    edgeElasticity: () => 130,
    numIter: 1400,
    gravity: 24,
    fit: true,
  } as unknown as cytoscape.LayoutOptions;
}

/* ── Color maps (dark-theme primary, theme-agnostic hex) ──────────── */
const NODE_COLORS: Record<string, string> = {
  standard:  "#00d4e8",  // cyan
  meeting:   "#a855f7",  // purple
  decision:  "#f97316",  // orange
  incident:  "#ef4444",  // red
  template:  "#22c55e",  // green
  default:   "#6b7280",  // gray
};

const EDGE_COLORS: Record<string, string> = {
  wikilink:    "#00d4e8",
  ai_inferred: "#a855f7",
  semantic:    "#c084fc",
  manual:      "#22c55e",
  citation:    "#fbbf24",
  default:     "#6b7280",
};

/* ── Component ────────────────────────────────────────────────────── */
const HOVER_CLEAR_MS = 160;

export const CytoscapeViewer = forwardRef<CytoscapeRef, Props>(
  function CytoscapeViewer({ nodes, edges, layoutName, onNodeClick, onNodeDoubleClick, onNodeRightClick, onHoverChange }, ref) {
    const containerRef     = useRef<HTMLDivElement>(null);
    const cyRef            = useRef<cytoscape.Core | null>(null);
    const onClickRef       = useRef(onNodeClick);
    const onDblClickRef    = useRef(onNodeDoubleClick);
    const onRightClickRef  = useRef(onNodeRightClick);
    const onHoverChangeRef = useRef(onHoverChange);

    // Keep callback refs fresh without re-initialising Cytoscape
    useEffect(() => { onClickRef.current    = onNodeClick;       }, [onNodeClick]);
    useEffect(() => { onDblClickRef.current = onNodeDoubleClick; }, [onNodeDoubleClick]);
    useEffect(() => { onRightClickRef.current = onNodeRightClick; }, [onNodeRightClick]);
    useEffect(() => { onHoverChangeRef.current = onHoverChange; }, [onHoverChange]);

    /* ── Imperative handle ── */
    useImperativeHandle(ref, () => ({
      zoomIn() {
        if (!cyRef.current || !containerRef.current) return;
        const cx = containerRef.current.offsetWidth  / 2;
        const cy_ = containerRef.current.offsetHeight / 2;
        cyRef.current.zoom({ level: cyRef.current.zoom() * 1.25, renderedPosition: { x: cx, y: cy_ } });
      },
      zoomOut() {
        if (!cyRef.current || !containerRef.current) return;
        const cx = containerRef.current.offsetWidth  / 2;
        const cy_ = containerRef.current.offsetHeight / 2;
        cyRef.current.zoom({ level: cyRef.current.zoom() / 1.25, renderedPosition: { x: cx, y: cy_ } });
      },
      fit() {
        cyRef.current?.fit(undefined, 60);
      },
      exportPng() {
        if (!cyRef.current) return;
        const dataUrl = cyRef.current.png({ scale: 2, full: true, bg: "#050508" });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "knowledge-graph.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
      setLayout(name: string) {
        if (!cyRef.current) return;
        cyRef.current.layout(getLayoutOptions(name)).run();
      },
      highlightSearch(query: string) {
        if (!cyRef.current) return;
        const q = query.toLowerCase().trim();
        if (!q) { cyRef.current.elements().removeClass("faded highlighted"); return; }
        cyRef.current.nodes().forEach(n => {
          const label = ((n.data("label") as string) || "").toLowerCase();
          if (label.includes(q)) {
            n.removeClass("faded").addClass("highlighted");
          } else {
            n.addClass("faded").removeClass("highlighted");
          }
        });
        cyRef.current.edges().addClass("faded");
      },
      clearSearch() {
        cyRef.current?.elements().removeClass("faded highlighted");
      },
      focusNode(id: string) {
        const cy = cyRef.current;
        if (!cy) return;
        const n = cy.getElementById(id);
        if (n.empty() || !n.isNode()) return;
        cy.elements().unselect();
        n.select();
        const z = cy.zoom();
        const targetZoom = Math.min(Math.max(z, 0.85), 1.35);
        cy.animate({
          center: { eles: n },
          zoom: targetZoom,
          duration: 560,
          easing: "ease-in-out-cubic",
        });
      },
    }));

    /* ── Layout reactivity ── */
    useEffect(() => {
      if (!cyRef.current) return;
      cyRef.current.layout(getLayoutOptions(layoutName || "circle")).run();
    }, [layoutName]);

    /* ── Cytoscape initialisation ── */
    useEffect(() => {
      if (!containerRef.current) return;
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

      const cy = cytoscape({
        container: containerRef.current,
        elements: {
          nodes: nodes.map(n => ({
            data: {
              id:         n.id,
              label:      n.title,
              type:       n.type       || "standard",
              slug:       n.slug       || "",
              summary:    n.summary    || "",
              updated_at: n.updated_at || "",
            },
          })),
          edges: edges.map(e => ({
            data: {
              id:         e.id,
              source:     e.from,
              target:     e.to,
              type:       e.type       || "wikilink",
              confidence: e.confidence ?? 1,
              created_by: e.created_by ?? "human",
            },
          })),
        },

        style: [
          /* ── Nodes ── */
          {
            selector: "node",
            style: {
              shape: "ellipse",
              "background-color": (ele: NodeLike) =>
                NODE_COLORS[ele.data("type") as string] ?? NODE_COLORS.default,
              "label":           "data(label)",
              "color":           "rgba(255,255,255,0.92)",
              "font-size":       "10px",
              "min-zoomed-font-size": 8,
              "font-family":     "Inter, system-ui, sans-serif",
              "font-weight":     500,
              "text-valign":     "bottom",
              "text-halign":     "center",
              "text-margin-y":   3,
              "text-background-opacity": 0,
              "text-wrap":       "ellipsis",
              "text-max-width":  "64px",
              /* Size scales with degree — larger nodes for better visibility */
              "width": (ele: NodeLike) => {
                const d = ele.connectedEdges().length;
                if (d >= 8) return 32;
                if (d >= 5) return 28;
                if (d >= 3) return 24;
                return 20;
              },
              "height": (ele: NodeLike) => {
                const d = ele.connectedEdges().length;
                if (d >= 8) return 32;
                if (d >= 5) return 28;
                if (d >= 3) return 24;
                return 20;
              },
              "border-width":   1,
              "border-color": (ele: NodeLike) =>
                NODE_COLORS[ele.data("type") as string] ?? NODE_COLORS.default,
              "border-opacity": 0.5,
              /* No overlay-* — Cytoscape draws overlays as a box around the node bbox (reads as a rectangle). */
              "transition-property": "opacity, width, height, border-width, border-opacity",
              "transition-duration":       320,
              "transition-timing-function": "ease-in-out-cubic",
            },
          },
          /* ── Node: selected ── */
          {
            selector: "node:selected",
            style: {
              "border-width": 2,
              "border-opacity": 1,
              "border-color": (ele: NodeLike) =>
                NODE_COLORS[ele.data("type") as string] ?? NODE_COLORS.default,
            },
          },
          /* ── Node: hovered — ring only; wiki text lives in GraphHoverPreview (HTML), not on canvas */
          {
            selector: "node.hovered",
            style: {
              "border-width": 2,
              "border-opacity": 1,
              "border-color": (ele: NodeLike) =>
                NODE_COLORS[ele.data("type") as string] ?? NODE_COLORS.default,
            },
          },
          /* ── Faded (search or hover neighborhood) ── */
          {
            selector: ".faded, .faded-hover",
            style: { opacity: 0.1 },
          },
          /* ── Highlighted (search match) ── */
          {
            selector: "node.highlighted",
            style: {
              opacity: 1,
              "border-width": 2,
              "border-opacity": 1,
            },
          },

          /* ── Edges ── */
          {
            selector: "edge",
            style: {
              "width": (ele: EdgeLike) => {
                const conf = (ele.data("confidence") as number) ?? 1;
                return 0.3 + conf * 0.75;
              },
              "line-color": (ele: EdgeLike) =>
                EDGE_COLORS[ele.data("type") as string] ?? EDGE_COLORS.default,
              "line-opacity": (ele: EdgeLike) => {
                const conf = (ele.data("confidence") as number) ?? 1;
                return 0.42 + conf * 0.28;
              },
              "target-arrow-color": (ele: EdgeLike) =>
                EDGE_COLORS[ele.data("type") as string] ?? EDGE_COLORS.default,
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              opacity: 0.5,
            },
          },
          /* ── Edge: hovered ── */
          {
            selector: "edge.hovered",
            style: {
              "line-opacity": 1,
              "width": (ele: EdgeLike) =>
                (0.3 + ((ele.data("confidence") as number) ?? 1) * 0.75) * 1.22,
              "overlay-opacity": 0,
            },
          },
        ],

        layout: getLayoutOptions(layoutName || "circle"),

        minZoom: 0.15,
        maxZoom: 5,
        wheelSensitivity: 0.2,
      });

      cyRef.current = cy;

      const hoverTargetRef = { kind: null as "node" | "edge" | null, id: null as string | null };
      let clearHoverTimer: ReturnType<typeof setTimeout> | null = null;

      const cancelClearHover = () => {
        if (clearHoverTimer) {
          clearTimeout(clearHoverTimer);
          clearHoverTimer = null;
        }
      };

      const emitHover = () => {
        const cb = onHoverChangeRef.current;
        if (!cb) return;
        if (hoverTargetRef.kind === "node" && hoverTargetRef.id) {
          const n = cy.getElementById(hoverTargetRef.id);
          if (!n.empty() && n.isNode()) {
            const rp = n.renderedPosition();
            const bb = n.renderedBoundingBox();
            cb({
              kind: "node",
              id: hoverTargetRef.id,
              renderedPosition: { x: rp.x, y: rp.y },
              renderedBoundingBox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
            });
          }
          return;
        }
        if (hoverTargetRef.kind === "edge" && hoverTargetRef.id) {
          const edge = cy.getElementById(hoverTargetRef.id);
          if (!edge.empty() && edge.isEdge()) {
            const rm = edge.renderedMidpoint();
            cb({
              kind: "edge",
              id: hoverTargetRef.id,
              sourceId: edge.source().id(),
              targetId: edge.target().id(),
              renderedMidpoint: { x: rm.x, y: rm.y },
            });
          }
        }
      };

      const scheduleClearHover = () => {
        cancelClearHover();
        clearHoverTimer = setTimeout(() => {
          hoverTargetRef.kind = null;
          hoverTargetRef.id = null;
          onHoverChangeRef.current?.(null);
          clearHoverTimer = null;
        }, HOVER_CLEAR_MS);
      };

      /* ── Hover (preview + cytoscape styling + neighborhood highlight) ── */
      cy.on("mouseover", "node", evt => {
        cancelClearHover();
        const node = evt.target;
        node.addClass("hovered");

        // Neighborhood highlight logic
        cy.elements().addClass("faded-hover");
        node.removeClass("faded-hover");
        node.connectedEdges().removeClass("faded-hover");
        node.connectedEdges().connectedNodes().removeClass("faded-hover");

        hoverTargetRef.kind = "node";
        hoverTargetRef.id = node.id();
        emitHover();
      });
      cy.on("mouseout", "node", evt => {
        evt.target.removeClass("hovered");
        cy.elements().removeClass("faded-hover");
        if (hoverTargetRef.kind === "node" && hoverTargetRef.id === evt.target.id()) {
          scheduleClearHover();
        }
      });

      cy.on("mouseover", "edge", evt => {
        cancelClearHover();
        const edge = evt.target;
        edge.addClass("hovered");

        // Edge neighborhood highlight logic
        cy.elements().addClass("faded-hover");
        edge.removeClass("faded-hover");
        edge.connectedNodes().removeClass("faded-hover");

        hoverTargetRef.kind = "edge";
        hoverTargetRef.id = edge.id();
        emitHover();
      });
      cy.on("mouseout", "edge", evt => {
        evt.target.removeClass("hovered");
        cy.elements().removeClass("faded-hover");
        if (hoverTargetRef.kind === "edge" && hoverTargetRef.id === evt.target.id()) {
          scheduleClearHover();
        }
      });

      cy.on("viewport", () => {
        if (hoverTargetRef.kind && hoverTargetRef.id) emitHover();
      });

      /* ── Click: select node & auto-focus ── */
      cy.on("tap", "node", evt => {
        cancelClearHover();
        onHoverChangeRef.current?.(null);
        hoverTargetRef.kind = null;
        hoverTargetRef.id = null;
        onClickRef.current?.(evt.target.id());

        const n = evt.target;
        const z = cy.zoom();
        const targetZoom = Math.min(Math.max(z, 0.85), 1.35);
        cy.animate({
          center: { eles: n },
          zoom: targetZoom,
          duration: 350,
          easing: "ease-out-cubic",
        });
      });

      /* ── Right-Click (Context Menu Hook) ── */
      cy.on("cxttap", "node", evt => {
        onRightClickRef.current?.(evt.target.id(), evt.originalEvent);
      });

      /* ── Double-click: fit to 1-hop neighborhood ── */
      cy.on("dbltap", "node", evt => {
        const node = evt.target;
        const hood = node.closedNeighborhood();
        cy.animate({ fit: { eles: hood, padding: 80 }, duration: 520, easing: "ease-in-out-cubic" });
        onDblClickRef.current?.(node.id());
      });

      /* ── Background tap: deselect + clear hover preview ── */
      cy.on("tap", evt => {
        if (evt.target === cy) {
          cy.elements().unselect();
          cancelClearHover();
          hoverTargetRef.kind = null;
          hoverTargetRef.id = null;
          onHoverChangeRef.current?.(null);
        }
      });

      return () => {
        cancelClearHover();
        cy.destroy();
        cyRef.current = null;
      };
    }, [nodes, edges, layoutName]);

    return (
      <div className="relative h-full w-full overflow-hidden bg-[var(--bg-950)] select-none">
        <div
          className="pointer-events-none absolute inset-0 z-0 motion-reduce:opacity-30"
          aria-hidden
        >
          <div className="graph-ambient-orb graph-ambient-orb--a" />
          <div className="graph-ambient-orb graph-ambient-orb--b" />
          <div className="graph-ambient-orb graph-ambient-orb--c" />
        </div>
        <div
          ref={containerRef}
          className="relative z-[1] h-full w-full bg-transparent"
        />
      </div>
    );
  }
);
