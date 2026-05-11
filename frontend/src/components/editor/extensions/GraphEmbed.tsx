import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const CytoscapeViewer = dynamic(
  () => import('@/components/graph/CytoscapeViewer').then(mod => mod.CytoscapeViewer),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center">Loading Graph...</div> }
);

function GraphEmbedComponent({ node }: any) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const teamId = node.attrs.teamId;

  useEffect(() => {
    if (!teamId) return;
    // Fetch a mini version of the graph or the full graph
    api.get(`/wiki/${teamId}/graph/`)
      .then((res: any) => {
        setNodes(res.nodes || []);
        setEdges(res.edges || []);
      })
      .catch(err => console.error("Failed to load graph embed", err));
  }, [teamId]);

  return (
    <NodeViewWrapper className="graph-embed-block my-6 border border-[var(--border-strong)] rounded-xl overflow-hidden h-[400px] w-full relative bg-[var(--bg-950)]">
      <div className="absolute top-2 left-3 z-10 bg-[var(--bg-800)] px-2 py-1 rounded text-xs text-[var(--text-muted)] border border-[var(--border-subtle)]">
        Interactive Map of Content
      </div>
      <CytoscapeViewer nodes={nodes} edges={edges} />
    </NodeViewWrapper>
  );
}

export const GraphEmbed = Node.create({
  name: 'graphEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      teamId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="graph-embed"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'graph-embed' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GraphEmbedComponent);
  },
});
