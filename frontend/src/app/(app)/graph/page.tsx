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

export default function GraphPage() {
  const router          = useRouter();
  const { currentTeamId } = useWikiStore();

  const [data, setData]                 = useState<GraphData | null>(null);
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
    api
      .get(`/graph/${currentTeamId}/`)
      .then(setData)
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
