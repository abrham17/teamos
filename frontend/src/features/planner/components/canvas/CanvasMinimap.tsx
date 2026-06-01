"use client";

import { useMemo } from "react";
import type { CanvasNode, CanvasEdge, CanvasViewport } from "../../canvasApi";

interface CanvasMinimapProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  onNavigate: (panX: number, panY: number) => void;
}

const MINIMAP_SIZE = 160;
const NODE_COLORS: Record<string, string> = {
  task: "#8b7ff4",
  wiki: "#fbbf24",
  member: "#60a5fa",
  milestone: "#34d399",
  trigger: "#2dd4bf",
  output: "#f87171",
};

export function CanvasMinimap({ nodes, edges, viewport, onNavigate }: CanvasMinimapProps) {
  const bounds = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1600, maxY: 1200, width: 1600, height: 1200 };
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + 300;
    const maxY = Math.max(...ys) + 120;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [nodes]);

  const scale = Math.min(MINIMAP_SIZE / bounds.width, MINIMAP_SIZE / bounds.height, 1);

  const toMinimap = (x: number, y: number) => ({
    mx: (x - bounds.minX) * scale,
    my: (y - bounds.minY) * scale,
  });

  const { mx: vx, my: vy } = toMinimap(-viewport.panX / viewport.zoom, -viewport.panY / viewport.zoom);
  const vw = (3200 / viewport.zoom) * scale;
  const vh = (2000 / viewport.zoom) * scale;

  return (
    <div
      className="absolute bottom-16 right-3.5 z-20 bg-[#0d0d12] border border-[rgba(255,255,255,0.07)] rounded-lg overflow-hidden shadow-lg"
      style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
    >
      <svg width={MINIMAP_SIZE} height={MINIMAP_SIZE} className="w-full h-full">
        {edges.map((edge) => {
          const source = nodes.find((n) => n.id === edge.source);
          const target = nodes.find((n) => n.id === edge.target);
          if (!source || !target) return null;
          const s = toMinimap(source.x + 130, source.y + 60);
          const t = toMinimap(target.x + 130, target.y + 60);
          return (
            <line
              key={edge.id}
              x1={s.mx}
              y1={s.my}
              x2={t.mx}
              y2={t.my}
              stroke="rgba(139,127,244,0.2)"
              strokeWidth={0.8}
            />
          );
        })}
        {nodes.map((node) => {
          const pos = toMinimap(node.x + 130, node.y + 60);
          const color = NODE_COLORS[node.type] || "#8b7ff4";
          return (
            <circle
              key={node.id}
              cx={pos.mx}
              cy={pos.my}
              r={2.5}
              fill={color}
              opacity={0.7}
            />
          );
        })}
        <rect
          x={vx}
          y={vy}
          width={vw}
          height={vh}
          fill="none"
          stroke="rgba(139,127,244,0.5)"
          strokeWidth={1}
          rx={2}
          className="cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.closest("svg")!.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / MINIMAP_SIZE) * bounds.width + bounds.minX;
            const py = ((e.clientY - rect.top) / MINIMAP_SIZE) * bounds.height + bounds.minY;
            onNavigate(-px * viewport.zoom + 800, -py * viewport.zoom + 400);
          }}
        />
      </svg>
    </div>
  );
}
