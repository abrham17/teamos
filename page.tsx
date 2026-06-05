"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2, AlertTriangle } from "lucide-react";

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
import { GraphToolbar } from "@/components/graph/GraphToolbar";
import { NodeInspector, type LinkedNode } from "@/components/graph/NodeInspector";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { ICONSCOUT } from "@/lib/iconscoutAssets";

// GraphLegend, Graph Insights overlay, and orphan warning card REMOVED.
// Orphan pages are now surfaced as a count badge inside GraphToolbar.

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphAnalytics {
  page_rank: Record<string, number>;
  clusters: Record<string, string>;
  cluster_sizes: Record<string, number>;
  hubs: Array<{ to_page_id: string; to_page__title: string; to_page__slug: string; score: number }>;
  orphans: Array<{ id: string; title: string; slug: string }>;
  node_count: number;
  edge_count: number;
}

const ALL_NODE_TYPES = ["standard", "meeting", "decision", "incident", "template"] as const;
const ALL_EDGE_TYPES = ["wikilink", "semantic", "ai_inferred", "manual", "citation"] as const;

export default function GraphPage() {
  const router = useRouter();
  const { currentTeamId } = useWikiStore();

  const [data, setData] = useState<GraphData | null>(null);
  const [analytics, setAnalytics] = useState<GraphAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [layout, setLayout] = useState("circle");
  const [hoverPayload, setHoverPayload] = useState<GraphHoverPayload | null>(null);
  const [nodeHoverDetail, setNodeHoverDetail] = useState<GraphNodeHoverDetail | null>(null);
  const [nodeHoverDetailLoading, setNodeHoverDetailLoading] = useState(false);

  const cyRef = useRef<CytoscapeRef>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  /* ── Fetch ── */
  useEffect(() => {
    if (!currentTeamId) return;
    setLoading(true);
    setSelectedNodeId(null);
    Promise.all([
      api.get<GraphData>(`/graph/${currentTeamId}/`),
      api.get<GraphAnalytics>(`/graph/${currentTeamId}/analytics/`),
    ])
      .then(([graphData, analyticsData]) => {
        setData(graphData);
        setAnalytics(analyticsData);
        setError(null);
      })
      .catch(() => setError("Failed to load knowledge graph."))
      .finally(() => setLoading(false));
  }, [currentTeamId]);

  /* ── Debounced hover detail ── */
  useEffect(() => {
    const hoveredNodeId = hoverPayload?.kind === "node" ? hoverPayload.id : null;
    if (!currentTeamId || !hoveredNodeId) {
      setNodeHoverDetail(null);
      setNodeHoverDetailLoading(false);
      return;
    }
    let cancelled = false;
    setNodeHoverDetail(null);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setNodeHoverDetailLoading(true);
      api
        .get<GraphNodeHoverDetail>(`/graph/${currentTeamId}/nodes/${hoveredNodeId}/`)
        .then((detail) => { if (!cancelled) setNodeHoverDetail(detail); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setNodeHoverDetailLoading(false); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [currentTeamId, hoverPayload]);

  /* ── Derived state ── */
  const selectedNode = selectedNodeId
    ? data?.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const linkedNodes: LinkedNode[] = useMemo(() => {
    if (!selectedNode || !data) return [];
    return data.edges
      .filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
      .map((e) => {
        const otherId = e.from === selectedNode.id ? e.to : e.from;
        const node = data.nodes.find((n) => n.id === otherId);
        if (!node) return null;
        return { ...node, edgeId: e.id, edgeType: e.type ?? "wikilink" } as LinkedNode;
      })
      .filter((n): n is LinkedNode => n !== null);
  }, [selectedNode, data]);

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
    return { kind: "edge", edge, sourceTitle: src.title, targetTitle: tgt.title };
  }, [hoverPayload, data]);

  /* ── Handlers ── */
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (!q.trim()) cyRef.current?.clearSearch();
    else cyRef.current?.highlightSearch(q);
  }, []);

  const handleLayoutChange = useCallback((name: string) => {
    setLayout(name);
    cyRef.current?.setLayout(name);
  }, []);

  /* ── Guard ── */
  if (!currentTeamId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        Select a team first
      </div>
    );
  }

  const orphanCount = analytics?.orphans.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-950)]">
      {/* Toolbar — now carries orphan count as a badge, no separate panel */}
      <GraphToolbar
        nodeCount={data?.nodes.length ?? 0}
        edgeCount={data?.edges.length ?? 0}
        loading={loading}
        searchQuery={searchQuery}
        layout={layout}
        onSearch={handleSearch}
        onLayoutChange={handleLayoutChange}
        onZoomIn={() => cyRef.current?.zoomIn()}
        onZoomOut={() => cyRef.current?.zoomOut()}
        onFit={() => cyRef.current?.fit()}
        onExportPng={() => cyRef.current?.exportPng()}
        // Pass orphan count as a toolbar badge
        // (GraphToolbar should render a small badge next to node count)
        orphanCount={orphanCount}
        isolateSelection={false}
        onToggleIsolateSelection={() => {}}
      />

      {/* Canvas */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
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
              Retry
            </button>
          </div>
        )}

        {loading && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20">
            <div
              className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent"
              style={{ animation: "spin 0.75s linear infinite" }}
            />
            <p className="text-sm text-[var(--text-muted)]">Loading graph…</p>
          </div>
        )}

        {!loading && data && data.nodes.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <EmptyState
              compact
              illustrationSrc={ICONSCOUT.illustrations.emptyGraph}
              illustrationAlt="Empty knowledge graph"
              title="No knowledge graph yet"
              description="Create wiki pages with [[wikilinks]] to connect ideas."
            />
          </div>
        )}

        {data && data.nodes.length > 0 && (
          <div ref={canvasWrapRef} className="absolute inset-0">
            <CytoscapeViewer
              ref={cyRef}
              nodes={data.nodes}
              edges={data.edges}
              layoutName={layout}
              onNodeClick={(id) => setSelectedNodeId(id || null)}
              onNodeDoubleClick={setSelectedNodeId}
              onHoverChange={setHoverPayload}
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

        {/* Orphan notice — minimal inline badge, not a panel */}
        {orphanCount > 0 && data && data.nodes.length > 0 && (
          <div className="absolute bottom-4 left-4 z-10">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-semibold backdrop-blur-sm">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {orphanCount} orphan{orphanCount !== 1 ? "s" : ""} — add wikilinks to connect
            </div>
          </div>
        )}

        {/* Node inspector */}
        <NodeInspector
          node={selectedNode}
          linkedNodes={linkedNodes}
          onClose={() => setSelectedNodeId(null)}
          onOpenEditor={(slug) => router.push(`/wiki?page=${slug}`)}
          onSelectLinkedNode={(id) => {
            setSelectedNodeId(id);
            cyRef.current?.focusNode(id);
          }}
        />
      </div>
    </div>
  );
}
