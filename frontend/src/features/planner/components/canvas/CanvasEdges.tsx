"use client";

import type { CanvasNode, CanvasEdge } from "../../canvasApi";

const EDGE_COLORS: Record<string, string> = {
  task: "rgba(139,127,244,0.45)",
  wiki: "rgba(251,191,36,0.35)",
  member: "rgba(96,165,250,0.4)",
  milestone: "rgba(52,211,153,0.4)",
  trigger: "rgba(45,212,191,0.45)",
  output: "rgba(248,113,113,0.35)",
};

interface CanvasEdgesProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  connectingFrom: string | null;
  connectionMousePos: { x: number; y: number } | null;
}

export function CanvasEdges({ nodes, edges, connectingFrom, connectionMousePos }: CanvasEdgesProps) {
  const sourceNode = connectingFrom ? nodes.find((n) => n.id === connectingFrom) : null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ overflow: "visible" }}
    >
      {edges.map((edge) => {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) return null;

        const sx = source.x + 260;
        const sy = source.y + 60;
        const tx = target.x;
        const ty = target.y + 60;
        const dx = Math.abs(tx - sx) * 0.45;
        const d = `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
        const stroke = EDGE_COLORS[source.type] || "rgba(139,127,244,0.4)";

        return (
          <g key={edge.id}>
            <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="5,4" />
            <circle cx={tx} cy={ty} r={3} fill={stroke.replace(/0\.\d+\)/, "0.8)")} />
          </g>
        );
      })}

      {sourceNode && connectionMousePos && (
        <g>
          <path
            d={`M${sourceNode.x + 260},${sourceNode.y + 60} L${connectionMousePos.x},${connectionMousePos.y}`}
            fill="none"
            stroke={EDGE_COLORS[sourceNode.type] || "rgba(139,127,244,0.4)"}
            strokeWidth={2}
            strokeDasharray="6,4"
            style={{ filter: "drop-shadow(0 0 6px rgba(139,127,244,0.3))" }}
          />
          <circle
            cx={connectionMousePos.x}
            cy={connectionMousePos.y}
            r={4}
            fill="rgba(139,127,244,0.6)"
          />
        </g>
      )}
    </svg>
  );
}
