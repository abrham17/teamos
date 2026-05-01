"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";

import {
  CytoscapeViewer,
  type CytoscapeRef,
  type GraphNode,
  type GraphEdge,
} from "@/components/graph/CytoscapeViewer";
import { GraphToolbar }  from "@/components/graph/GraphToolbar";
import { NodeInspector, type LinkedNode } from "@/components/graph/NodeInspector";
import { GraphLegend }   from "@/components/graph/GraphLegend";
import { useWikiStore }  from "@/stores/useWikiStore";
import { api }           from "@/lib/api";

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
}

export default function GraphPage() {
  const router          = useRouter();
  const { currentTeamId } = useWikiStore();

  const [data, setData]                 = useState<GraphData | null>(null);
  const [analytics, setAnalytics]       = useState<GraphAnalytics | null>(null);
  const [loading, setLoading]           = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]   = useState("");
  const [layout, setLayout]             = useState("cose");

  const cyRef = useRef<CytoscapeRef>(null);

  /* ── Fetch graph data ── */
  useEffect(() => {
    if (!currentTeamId) return;
    setLoading(true);
    setSelectedNodeId(null);
    Promise.all([
      api.get(`/graph/${currentTeamId}/`),
      api.get(`/graph/${currentTeamId}/analytics/`),
    ])
      .then(([graphData, analyticsData]) => {
        setData(graphData);
        setAnalytics(analyticsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentTeamId]);

  /* ── Derived state ── */
  const selectedNode = selectedNodeId
    ? data?.nodes.find(n => n.id === selectedNodeId) ?? null
    : null;

  const linkedNodes: LinkedNode[] = selectedNode && data
    ? data.edges
        .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
        .map(e => {
          const otherId = e.from === selectedNode.id ? e.to : e.from;
          const node    = data.nodes.find(n => n.id === otherId);
          return node ? { ...node, edgeType: e.type ?? "wikilink" } : null;
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
      />

      {/* Canvas area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">

        {/* Loading state */}
        {loading && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20">
            <div
              className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent"
              style={{ animation: "spin 0.75s linear infinite" }}
            />
            <p className="text-sm text-[var(--text-muted)]">Analysing semantic relationships…</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && data && data.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20">
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
        {data && data.nodes.length > 0 && (
          <CytoscapeViewer
            ref={cyRef}
            nodes={data.nodes}
            edges={data.edges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={setSelectedNodeId}
          />
        )}

        {/* Analytics overlay */}
        {analytics && data && data.nodes.length > 0 && (
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-sm">
            <div className="bg-[var(--glass-heavy-bg)] backdrop-blur-sm border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)]">
              <div className="font-semibold text-[var(--text-primary)] mb-1">Graph Insights</div>
              <div>
                {Object.keys(analytics.cluster_sizes || {}).length} clusters ·{" "}
                {analytics.orphans.length} orphan pages
              </div>
            </div>

            {analytics.orphans.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 text-xs text-amber-300">
                <div className="font-semibold mb-1">Orphan Warning</div>
                <div>
                  {analytics.orphans.length} pages have no graph links yet. Add wikilinks to
                  improve discoverability.
                </div>
              </div>
            )}

            {analytics.hubs.length > 0 && (
              <div className="bg-[var(--glass-heavy-bg)] backdrop-blur-sm border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)]">
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
        />

        {/* Legend (bottom-left overlay) */}
        {data && data.nodes.length > 0 && <GraphLegend />}
      </div>
    </div>
  );
}
