"use client";

import { useMemo } from "react";
import type { CanvasNode, CanvasEdge } from "../../canvasApi";

const EDGE_COLORS: Record<string, string> = {
  task: "rgba(139,127,244,0.45)",
  wiki: "rgba(251,191,36,0.35)",
  member: "rgba(96,165,250,0.4)",
  milestone: "rgba(52,211,153,0.4)",
  trigger: "rgba(45,212,191,0.45)",
  output: "rgba(248,113,113,0.35)",
};

const EDGE_SOLID_COLORS: Record<string, string> = {
  task: "rgba(139,127,244,0.85)",
  wiki: "rgba(251,191,36,0.75)",
  member: "rgba(96,165,250,0.8)",
  milestone: "rgba(52,211,153,0.8)",
  trigger: "rgba(45,212,191,0.85)",
  output: "rgba(248,113,113,0.75)",
};

interface CanvasEdgesProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  connectingFrom: string | null;
  connectionMousePos: { x: number; y: number } | null;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  selectedNodeIds: string[];
  onEdgeContextMenu?: (e: React.MouseEvent, edgeId: string) => void;
}

export function CanvasEdges({
  nodes,
  edges,
  connectingFrom,
  connectionMousePos,
  selectedEdgeId,
  onSelectEdge,
  selectedNodeIds,
  onEdgeContextMenu,
}: CanvasEdgesProps) {
  const nodeMap = useMemo(() => {
    const m = new Map<string, CanvasNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const sourceNode = connectingFrom ? nodeMap.get(connectingFrom) : null;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ overflow: "visible" }}
    >
      {edges.map((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;

        const sx = source.x + 260;
        const sy = source.y + 60;
        const tx = target.x;
        const ty = target.y + 60;

        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;

        const dx = Math.abs(tx - sx) * 0.45;
        const d = `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
        const isSelected = selectedEdgeId === edge.id;
        const sourceConnected = selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target);
        const stroke = isSelected
          ? "rgba(139,127,244,0.9)"
          : sourceConnected
            ? EDGE_SOLID_COLORS[source.type] || "rgba(139,127,244,0.6)"
            : EDGE_COLORS[source.type] || "rgba(139,127,244,0.4)";

        return (
          <g key={edge.id}>
            {/* Invisible wide path for easier clicking */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectEdge(edge.id);
              }}
              onContextMenu={(e) => {
                e.stopPropagation();
                onEdgeContextMenu?.(e, edge.id);
              }}
            />
            {/* Visible path */}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={isSelected ? 3 : 2}
              strokeDasharray={isSelected ? "none" : sourceConnected ? "none" : "5,4"}
              className="pointer-events-none"
              style={{
                filter: isSelected ? "drop-shadow(0 0 6px rgba(139,127,244,0.4))" : "none",
              }}
            />
            {/* Midpoint label */}
            {(edge.label || isSelected) && (
              <foreignObject x={midX - 60} y={midY - 12} width={120} height={24} className="pointer-events-none">
                <div
                  className="text-[9px] text-center truncate px-1"
                  style={{
                    color: isSelected ? "#8b7ff4" : "#62627a",
                    textShadow: isSelected ? "0 0 4px rgba(139,127,244,0.3)" : "none",
                  }}
                >
                  {edge.label || "connected"}
                </div>
              </foreignObject>
            )}
            {/* Target arrowhead */}
            <circle
              cx={tx}
              cy={ty}
              r={isSelected ? 5 : 3}
              fill={stroke.replace(/0\.\d+\)/, isSelected ? "0.9)" : "0.6)")}
              className="pointer-events-none"
            />
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
            className="pointer-events-none"
            style={{ filter: "drop-shadow(0 0 6px rgba(139,127,244,0.3))" }}
          />
          <circle
            cx={connectionMousePos.x}
            cy={connectionMousePos.y}
            r={4}
            fill="rgba(139,127,244,0.6)"
            className="pointer-events-none"
          />
        </g>
      )}
    </svg>
  );
}
