"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";

import {
  CytoscapeViewer,
  type CytoscapeRef,
  type GraphHoverPayload,
  type GraphNode,
  type GraphEdge,
} from "@/components/graph/CytoscapeViewer";
import {
  GraphHoverPreview,
  type GraphHoverPreviewResolved,
  type GraphNodeHoverDetail,
} from "@/components/graph/GraphHoverPreview";
import { GraphToolbar }  from "@/components/graph/GraphToolbar";
import { NodeInspector, type LinkedNode } from "@/components/graph/NodeInspector";
import { GraphLegend }   from "@/components/graph/GraphLegend";
import { useWikiStore }  from "@/stores/useWikiStore";
import { api }           from "@/lib/api";
import {
  runGraphChromeEnter,
  runGraphOverlayEnter,
} from "@/lib/graphChromeMotion";

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  analytics_mode?: "simple" | "advanced";
}

interface GraphAnalytics {
  page_rank: Record<string, number>;
  clusters: Record<string, string>;
  cluster_sizes: Record<string, number>;
  hubs: Array<{
    to_page_id: string;
    to_page__title: string;
    to_page__slug: string;
    score: number;
  }>;
  orphans: Array<{ id: string; title: string; slug: string }>;
  node_count: number;
  edge_count: number;
  analytics_mode?: "simple" | "advanced";
  available_modes?: Array<"simple" | "advanced">;
}

const ALL_NODE_TYPES = ["standard", "meeting", "decision", "incident", "template"] as const;
const ALL_EDGE_TYPES = ["wikilink", "semantic", "ai_inferred", "manual", "citation"] as const;

export default function GraphPage() {
  const router          = useRouter();
  const { currentTeamId } = useWikiStore();

  const [data, setData]                 = useState<GraphData | null>(null);
  const [analytics, setAnalytics]       = useState<GraphAnalytics | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]   = useState("");
  const [layout, setLayout]             = useState("grid");
  const [analyticsMode, setAnalyticsMode] = useState<"simple" | "advanced">("simple");
  const [hoverPayload, setHoverPayload] = useState<GraphHoverPayload | null>(null);
  const [nodeHoverDetail, setNodeHoverDetail] = useState<GraphNodeHoverDetail | null>(null);
  const [nodeHoverDetailLoading, setNodeHoverDetailLoading] = useState(false);
  const [activeNodeTypes, setActiveNodeTypes] = useState<string[]>([...ALL_NODE_TYPES]);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<string[]>([...ALL_EDGE_TYPES]);
  const [isolateSelection, setIsolateSelection] = useState(false);

  const cyRef = useRef<CytoscapeRef>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const analyticsColRef = useRef<HTMLDivElement>(null);
  const legendWrapRef = useRef<HTMLDivElement>(null);
  const loadingWrapRef = useRef<HTMLDivElement>(null);
  const emptyWrapRef = useRef<HTMLDivElement>(null);

  /* ── Fetch graph data ── */
  useEffect(() => {
    if (!currentTeamId) return;
    setLoading(true);
    setSelectedNodeId(null);
    Promise.all([
      api.get<GraphData>(`/graph/${currentTeamId}/?mode=${analyticsMode}`),
      api.get<GraphAnalytics>(`/graph/${currentTeamId}/analytics/?mode=${analyticsMode}`),
    ])
      .then(([graphData, analyticsData]) => {
        setData(graphData);
        setAnalytics(analyticsData);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load knowledge graph.");
      })
      .finally(() => setLoading(false));
  }, [currentTeamId, analyticsMode]);

  useEffect(() => {
    setHoverPayload(null);
    setNodeHoverDetail(null);
    setNodeHoverDetailLoading(false);
  }, [data]);

  const hoveredNodeId =
    hoverPayload?.kind === "node" ? hoverPayload.id : null;

  /* Debounced rich hover for graph nodes (keyed by id only — not viewport bbox) */
  useEffect(() => {
    if (!currentTeamId || !hoveredNodeId) {
      setNodeHoverDetail(null);
      setNodeHoverDetailLoading(false);
      return;
    }
    let cancelled = false;
    setNodeHoverDetail(null);
    setNodeHoverDetailLoading(false);

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setNodeHoverDetailLoading(true);
      api
        .get<GraphNodeHoverDetail>(`/graph/${currentTeamId}/nodes/${hoveredNodeId}/`)
        .then((detail) => {
          if (cancelled) return;
          setNodeHoverDetail(detail);
        })
        .catch(() => {
          if (cancelled) return;
          setNodeHoverDetail(null);
        })
        .finally(() => {
          if (cancelled) return;
          setNodeHoverDetailLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentTeamId, hoveredNodeId]);

  /* ── Graph chrome motion (toolbar, overlays, legend — not Cytoscape nodes) ── */
  useLayoutEffect(() => {
    if (!currentTeamId) return undefined;

    if (loading && !data && loadingWrapRef.current) {
      return runGraphOverlayEnter({ root: loadingWrapRef.current });
    }

    if (!loading && data && data.nodes.length === 0 && emptyWrapRef.current) {
      return runGraphOverlayEnter({ root: emptyWrapRef.current });
    }

    if (!loading && data && data.nodes.length > 0) {
      const cards = analyticsColRef.current
        ? Array.from(
            analyticsColRef.current.querySelectorAll<HTMLElement>(
              "[data-graph-chrome-card]",
            ),
          )
        : [];
      return runGraphChromeEnter({
        toolbar: toolbarRef.current,
        canvas: canvasWrapRef.current,
        analyticsCards: cards,
        legend: legendWrapRef.current,
      });
    }

    return undefined;
  }, [currentTeamId, analyticsMode, loading, data]);

  /* ── Derived state ── */
  const selectedNode = selectedNodeId
    ? data?.nodes.find(n => n.id === selectedNodeId) ?? null
    : null;

  const filteredData = useMemo(() => {
    if (!data) return null;
    const nodeTypeSet = new Set(activeNodeTypes);
    const edgeTypeSet = new Set(activeEdgeTypes);
    let nodes = data.nodes.filter((n) => nodeTypeSet.has(n.type ?? "standard"));
    let nodeIds = new Set(nodes.map((n) => n.id));
    let edges = data.edges.filter(
      (e) =>
        edgeTypeSet.has(e.type ?? "wikilink") &&
        nodeIds.has(e.from) &&
        nodeIds.has(e.to),
    );

    if (isolateSelection && selectedNodeId && nodeIds.has(selectedNodeId)) {
      const keep = new Set<string>([selectedNodeId]);
      edges.forEach((e) => {
        if (e.from === selectedNodeId) keep.add(e.to);
        if (e.to === selectedNodeId) keep.add(e.from);
      });
      nodes = nodes.filter((n) => keep.has(n.id));
      nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
    }

    return { nodes, edges };
  }, [data, activeNodeTypes, activeEdgeTypes, isolateSelection, selectedNodeId]);

  const hoverResolved = useMemo((): GraphHoverPreviewResolved | null => {
    if (!hoverPayload || !data) return null;
    if (hoverPayload.kind === "node") {
      const node = data.nodes.find((n) => n.id === hoverPayload.id);
      if (!node) return null;
      const degree = data.edges.filter((e) => e.from === node.id || e.to === node.id).length;
      return { kind: "node", node, degree };
    }
    const edge = data.edges.find((e) => e.id === hoverPayload.id);
    if (!edge) return null;
    const src = data.nodes.find((n) => n.id === edge.from);
    const tgt = data.nodes.find((n) => n.id === edge.to);
    if (!src || !tgt) return null;
    return {
      kind: "edge",
      edge,
      sourceTitle: src.title,
      targetTitle: tgt.title,
    };
  }, [hoverPayload, data]);

  const linkedNodes: LinkedNode[] = selectedNode && data
    ? (filteredData?.edges ?? data.edges)
        .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
        .map(e => {
          const otherId = e.from === selectedNode.id ? e.to : e.from;
          const node    = data.nodes.find(n => n.id === otherId);
          if (!node) return null;
          const linked: LinkedNode = {
            ...node,
            edgeId: e.id,
            edgeType: e.type ?? "wikilink",
          };
          if (e.confidence !== undefined) linked.edgeConfidence = e.confidence;
          if (e.created_by !== undefined) linked.edgeCreatedBy = e.created_by;
          return linked;
        })
        .filter((n): n is LinkedNode => n !== null)
    : [];

  /* ── Handlers ── */
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      cyRef.current?.clearSearch();
    } else {
      cyRef.current?.highlightSearch(q);
    }
  }, []);

  const handleLayoutChange = useCallback((name: string) => {
    setLayout(name);
    cyRef.current?.setLayout(name);
  }, []);

  const handleNodeClick = useCallback((id: string) => {
    setSelectedNodeId(id || null);
  }, []);

  const handleHoverChange = useCallback((payload: GraphHoverPayload | null) => {
    setHoverPayload(payload);
  }, []);

  const handleToggleNodeType = useCallback((type: string) => {
    setActiveNodeTypes((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      return [...prev, type];
    });
  }, []);

  const handleToggleEdgeType = useCallback((type: string) => {
    setActiveEdgeTypes((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      return [...prev, type];
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setActiveNodeTypes([...ALL_NODE_TYPES]);
    setActiveEdgeTypes([...ALL_EDGE_TYPES]);
    setIsolateSelection(false);
  }, []);

  const handleSelectLinkedNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    cyRef.current?.focusNode(id);
  }, []);

  /* ── Guards ── */
  if (!currentTeamId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        Select a team first
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-900)]">
      {/* Toolbar */}
      <div ref={toolbarRef} className="shrink-0">
        <GraphToolbar
          nodeCount={filteredData?.nodes.length ?? 0}
          edgeCount={filteredData?.edges.length ?? 0}
          loading={loading}
          searchQuery={searchQuery}
          layout={layout}
          onSearch={handleSearch}
          onLayoutChange={handleLayoutChange}
          onZoomIn={() => cyRef.current?.zoomIn()}
          onZoomOut={() => cyRef.current?.zoomOut()}
          onFit={() => cyRef.current?.fit()}
          onExportPng={() => cyRef.current?.exportPng()}
          isolateSelection={isolateSelection}
          onToggleIsolateSelection={() => setIsolateSelection((v) => !v)}
        />
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Share2 className="w-8 h-8 text-rose-500" />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Graph failed to load</h3>
            <p className="text-sm text-[var(--text-muted)] text-center max-w-xs">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] rounded-xl text-xs font-bold transition-all"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && !data && (
          <div
            ref={loadingWrapRef}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20"
          >
            <div
              className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent"
              style={{ animation: "spin 0.75s linear infinite" }}
            />
            <p className="text-sm text-[var(--text-muted)]">Analysing semantic relationships…</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && data && data.nodes.length === 0 && (
          <div
            ref={emptyWrapRef}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-center">
              <Share2 className="w-8 h-8 text-[var(--text-dim)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">No knowledge graph yet</h3>
            <p className="text-sm text-[var(--text-muted)] text-center max-w-xs">
              Create wiki pages with <code className="text-[var(--accent)]">[[wikilinks]]</code> to build your graph.
            </p>
          </div>
        )}

        {/* Graph */}
        {filteredData && filteredData.nodes.length > 0 && (
          <div ref={canvasWrapRef} className="absolute inset-0">
            <CytoscapeViewer
              ref={cyRef}
              nodes={filteredData.nodes}
              edges={filteredData.edges}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={setSelectedNodeId}
              onHoverChange={handleHoverChange}
            />
            <GraphHoverPreview
              resolved={hoverResolved}
              hoverPayload={hoverPayload}
              containerRef={canvasWrapRef}
              nodeHoverDetail={nodeHoverDetail}
              nodeHoverDetailLoading={nodeHoverDetailLoading}
            />
          </div>
        )}

        {/* Analytics overlay */}
        {analytics && data && data.nodes.length > 0 && (
          <div
            ref={analyticsColRef}
            className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-sm"
          >
            <div
              data-graph-chrome-card
              className="bg-[var(--glass-heavy-bg)] backdrop-blur-sm border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)]"
            >
              <div className="font-semibold text-[var(--text-primary)] mb-1">Graph Insights</div>
              <div className="mb-1">
                <label className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mr-2">Mode</label>
                <select
                  value={analyticsMode}
                  onChange={(e) => setAnalyticsMode((e.target.value as "simple" | "advanced"))}
                  className="bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[10px]"
                >
                  <option value="simple">simple</option>
                  <option value="advanced">advanced</option>
                </select>
              </div>
              <div>
                {Object.keys(analytics.cluster_sizes || {}).length} clusters ·{" "}
                {analytics.orphans.length} orphan pages
              </div>
            </div>

            {analytics.orphans.length > 0 && (
              <div
                data-graph-chrome-card
                className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 text-xs text-amber-300"
              >
                <div className="font-semibold mb-1">Orphan Warning</div>
                <div>
                  {analytics.orphans.length} pages have no graph links yet. Add wikilinks to
                  improve discoverability.
                </div>
              </div>
            )}

            {analytics.hubs.length > 0 && (
              <div
                data-graph-chrome-card
                className="bg-[var(--glass-heavy-bg)] backdrop-blur-sm border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)]"
              >
                <div className="font-semibold text-[var(--text-primary)] mb-1">Top hubs</div>
                <div className="space-y-1">
                  {analytics.hubs.slice(0, 3).map((h) => (
                    <div key={h.to_page_id} className="truncate">
                      {h.to_page__title} <span className="text-[var(--text-dim)]">({h.score.toFixed(3)})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Node inspector (slides in from right) */}
        <NodeInspector
          node={selectedNode}
          linkedNodes={linkedNodes}
          onClose={() => setSelectedNodeId(null)}
          onOpenEditor={slug => router.push(`/wiki?page=${slug}`)}
          onSelectLinkedNode={handleSelectLinkedNode}
        />

        {/* Legend (bottom-left overlay) */}
        {filteredData && filteredData.nodes.length > 0 && (
          <div
            ref={legendWrapRef}
            className="absolute bottom-4 left-4 z-10"
          >
            <GraphLegend
              activeNodeTypes={activeNodeTypes}
              activeEdgeTypes={activeEdgeTypes}
              isolateSelection={isolateSelection}
              onToggleNodeType={handleToggleNodeType}
              onToggleEdgeType={handleToggleEdgeType}
              onToggleIsolateSelection={() => setIsolateSelection((v) => !v)}
              onResetFilters={handleResetFilters}
            />
          </div>
        )}
      </div>
    </div>
  );
}
