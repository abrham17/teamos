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
}

export interface CytoscapeRef {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  exportPng(): void;
  setLayout(name: string): void;
  highlightSearch(query: string): void;
  clearSearch(): void;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (id: string) => void;
  onNodeDoubleClick?: (id: string) => void;
}

type NodeLike = cytoscape.NodeSingular;
type EdgeLike = cytoscape.EdgeSingular;

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
  manual:      "#22c55e",
  default:     "#6b7280",
};

/* ── Component ────────────────────────────────────────────────────── */
export const CytoscapeViewer = forwardRef<CytoscapeRef, Props>(
  function CytoscapeViewer({ nodes, edges, onNodeClick, onNodeDoubleClick }, ref) {
    const containerRef     = useRef<HTMLDivElement>(null);
    const cyRef            = useRef<cytoscape.Core | null>(null);
    const onClickRef       = useRef(onNodeClick);
    const onDblClickRef    = useRef(onNodeDoubleClick);

    // Keep callback refs fresh without re-initialising Cytoscape
    useEffect(() => { onClickRef.current    = onNodeClick;       }, [onNodeClick]);
    useEffect(() => { onDblClickRef.current = onNodeDoubleClick; }, [onNodeDoubleClick]);

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
        cyRef.current
          .layout(({ name, animate: true, animationDuration: 500, padding: 60, fit: true } as unknown) as cytoscape.LayoutOptions)
          .run();
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
    }));

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
            },
          })),
        },

        style: [
          /* ── Nodes ── */
          {
            selector: "node",
            style: {
              "background-color": (ele: NodeLike) =>
                NODE_COLORS[ele.data("type") as string] ?? NODE_COLORS.default,
              "label":           "data(label)",
              "color":           "rgba(255,255,255,0.9)",
              "font-size":       "11px",
              "font-family":     "Inter, system-ui, sans-serif",
              "font-weight":     500,
              "text-valign":     "bottom",
              "text-halign":     "center",
              "text-margin-y":   7,
              "text-background-opacity": 0,
              "text-wrap":       "ellipsis",
              "text-max-width":  "110px",
              /* Size scales with degree */
              "width": (ele: NodeLike) => {
                const d = ele.connectedEdges().length;
                if (d >= 8) return 54;
                if (d >= 5) return 44;
                if (d >= 3) return 36;
                return 28;
              },
              "height": (ele: NodeLike) => {
                const d = ele.connectedEdges().length;
                if (d >= 8) return 54;
                if (d >= 5) return 44;
                if (d >= 3) return 36;
                return 28;
              },
              "border-width":   2,
              "border-color":   "rgba(255,255,255,0.14)",
              "border-opacity": 1,
              "overlay-opacity": 0,
              "transition-property":       "opacity, border-color, border-width",
              "transition-duration":       180,
              "transition-timing-function": "ease",
            },
          },
          /* ── Node: selected ── */
          {
            selector: "node:selected",
            style: {
              "border-width": 3,
              "border-color": "rgba(255,255,255,0.9)",
              "overlay-opacity": 0,
            },
          },
          /* ── Node: hovered ── */
          {
            selector: "node.hovered",
            style: {
              "border-width": 2.5,
              "border-color": "rgba(255,255,255,0.6)",
              "overlay-opacity": 0,
            },
          },
          /* ── Faded (search) ── */
          {
            selector: ".faded",
            style: { opacity: 0.1 },
          },
          /* ── Highlighted (search match) ── */
          {
            selector: "node.highlighted",
            style: {
              opacity: 1,
              "border-width": 3,
              "border-color": "rgba(255,255,255,0.9)",
            },
          },

          /* ── Edges ── */
          {
            selector: "edge",
            style: {
              "width": (ele: EdgeLike) => {
                const conf = (ele.data("confidence") as number) ?? 1;
                return 0.8 + conf * 2.2;
              },
              "line-color": (ele: EdgeLike) =>
                EDGE_COLORS[ele.data("type") as string] ?? EDGE_COLORS.default,
              "line-opacity": (ele: EdgeLike) => {
                const conf = (ele.data("confidence") as number) ?? 1;
                return 0.28 + conf * 0.5;
              },
              "target-arrow-color": (ele: EdgeLike) =>
                EDGE_COLORS[ele.data("type") as string] ?? EDGE_COLORS.default,
              "target-arrow-shape": "triangle",
              "arrow-scale":        0.7,
              "curve-style":        "bezier",
              "overlay-opacity":    0,
              "transition-property": "opacity, line-opacity",
              "transition-duration": 180,
            },
          },
          /* ── Edge: hovered ── */
          {
            selector: "edge.hovered",
            style: {
              "line-opacity": 1,
              "width": (ele: EdgeLike) =>
                (0.8 + ((ele.data("confidence") as number) ?? 1) * 2.2) * 1.6,
              "overlay-opacity": 0,
            },
          },
        ],

        layout: {
          name: "cose",
          animate: true,
          animationDuration: 700,
          padding: 60,
          nodeRepulsion: () => 8000,
          idealEdgeLength: () => 100,
          edgeElasticity: () => 200,
          numIter: 1000,
          gravity: 80,
          fit: true,
        },

        minZoom: 0.15,
        maxZoom: 5,
        wheelSensitivity: 0.2,
      });

      cyRef.current = cy;

      /* ── Hover ── */
      cy.on("mouseover", "node", evt => evt.target.addClass("hovered"));
      cy.on("mouseout",  "node", evt => evt.target.removeClass("hovered"));
      cy.on("mouseover", "edge", evt => evt.target.addClass("hovered"));
      cy.on("mouseout",  "edge", evt => evt.target.removeClass("hovered"));

      /* ── Click: select node ── */
      cy.on("tap", "node", evt => {
        onClickRef.current?.(evt.target.id());
      });

      /* ── Double-click: fit to 1-hop neighborhood ── */
      cy.on("dbltap", "node", evt => {
        const node = evt.target;
        const hood = node.closedNeighborhood();
        cy.animate({ fit: { eles: hood, padding: 80 }, duration: 400, easing: "ease-in-out-cubic" });
        onDblClickRef.current?.(node.id());
      });

      /* ── Background tap: deselect ── */
      cy.on("tap", evt => {
        if (evt.target === cy) cy.elements().unselect();
      });

      return () => {
        cy.destroy();
        cyRef.current = null;
      };
    }, [nodes, edges]);

    return (
      <div
        ref={containerRef}
        className="w-full h-full select-none"
        style={{ background: "var(--bg-900)" }}
      />
    );
  }
);
