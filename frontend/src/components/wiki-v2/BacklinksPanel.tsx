"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Link2, Sparkles, FileText, HelpCircle, Network } from "lucide-react";
import Link from "next/link";

interface BacklinksPanelProps {
  teamId: string;
  slug: string;
}

interface Backlink {
  page_slug: string;
  page_title: string;
  snippet: string;
  relation_type?: string;
}

interface UnlinkedMention {
  page_slug: string;
  page_title: string;
}

export function BacklinksPanel({ teamId, slug }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<{
    title: string;
    type: string;
    snippet?: string;
    slug: string;
  } | null>(null);

  useEffect(() => {
    if (!teamId || !slug) return;
    setLoading(true);
    Promise.all([
      api.get(`/wiki/${teamId}/pages/${slug}/backlinks/`).catch(() => []),
      api.get(`/wiki/${teamId}/pages/${slug}/unlinked/`).catch(() => []),
    ])
      .then(([bl, ul]) => {
        setBacklinks(bl as Backlink[]);
        setUnlinked(ul as UnlinkedMention[]);
      })
      .finally(() => setLoading(false));
  }, [teamId, slug]);

  if (loading) return null;
  if (backlinks.length === 0 && unlinked.length === 0) return null;

  // Let's build the interactive SVG graph nodes
  const width = 600;
  const height = 280;
  const centerX = width / 2;
  const centerY = height / 2;

  // We group nodes to arrange them around the center
  const graphNodes: Array<{
    x: number;
    y: number;
    title: string;
    slug: string;
    type: "center" | "backlink" | "unlinked" | "semantic";
    relationLabel: string;
    color: string;
    snippet?: string;
  }> = [];

  // 1. Central node representing current page
  graphNodes.push({
    x: centerX,
    y: centerY,
    title: slug.replace(/-/g, " ").toUpperCase(),
    slug: slug,
    type: "center",
    relationLabel: "Current Wiki Page",
    color: "#8b7ff4",
  });

  // Combine links
  const totalLeftNodes = backlinks.length;
  const totalRightNodes = unlinked.length;

  // Arrange backlinks on the left semi-circle
  backlinks.forEach((bl, idx) => {
    const angle = Math.PI - (Math.PI / 4) + (idx + 1) * ((Math.PI / 2) / (totalLeftNodes + 1));
    const radius = 160;
    graphNodes.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      title: bl.page_title,
      slug: bl.page_slug,
      type: bl.relation_type === "ai_inferred" ? "semantic" : "backlink",
      relationLabel: bl.relation_type === "ai_inferred" ? "AI Inferred" : "Wikilink",
      color: bl.relation_type === "ai_inferred" ? "#10b981" : "#6366f1",
      snippet: bl.snippet,
    });
  });

  // Arrange unlinked mentions on the right semi-circle
  unlinked.forEach((ul, idx) => {
    const angle = -(Math.PI / 4) + (idx + 1) * ((Math.PI / 2) / (totalRightNodes + 1));
    const radius = 160;
    graphNodes.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      title: ul.page_title,
      slug: ul.page_slug,
      type: "unlinked",
      relationLabel: "Unlinked Mention",
      color: "#fbbf24",
      snippet: "Mentioned textually in page body without explicit links.",
    });
  });

  return (
    <div className="mt-16 pt-10 border-t border-[rgba(255,255,255,0.06)] space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Network size={16} className="text-[#8b7ff4]" />
          Visual Backlink Network Subgraph
          <span className="bg-[#13131a] text-[#8b7ff4] text-[10px] px-2 py-0.5 rounded-full border border-[#8b7ff4]/20 font-bold">
            {backlinks.length + unlinked.length} Neighbors
          </span>
        </h3>
        <div className="flex gap-3 text-[10px] text-[#62627a]">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" /> Wikilink</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> AI Inferred</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" /> Unlinked Mention</span>
        </div>
      </div>

      {/* SVG Interactive network canvas */}
      <div className="bg-[#09090d] border border-[rgba(255,255,255,0.04)] rounded-2xl p-4 overflow-hidden relative shadow-inner">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto overflow-visible select-none">
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b7ff4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render Edge Connections */}
          {graphNodes.map((node, idx) => {
            if (node.type === "center") return null;
            return (
              <g key={`edge-${idx}`}>
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={node.x}
                  y2={node.y}
                  stroke={node.color}
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                  strokeDasharray={node.type === "unlinked" ? "4 4" : undefined}
                />
                <circle
                  cx={centerX + (node.x - centerX) * 0.4}
                  cy={centerY + (node.y - centerY) * 0.4}
                  r="3"
                  fill={node.color}
                  className="animate-pulse"
                />
              </g>
            );
          })}

          {/* Render Nodes */}
          {graphNodes.map((node, idx) => {
            const isCenter = node.type === "center";
            return (
              <Link 
                href={`/wiki?page=${node.slug}`} 
                key={`node-${idx}`}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredNode({
                  title: node.title,
                  type: node.relationLabel,
                  snippet: node.snippet,
                  slug: node.slug,
                })}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isCenter ? 14 : 9}
                  fill={isCenter ? "#8b7ff4" : "#0d0d12"}
                  stroke={node.color}
                  strokeWidth={isCenter ? 3 : 2}
                  filter={isCenter ? "url(#glow)" : undefined}
                  className="transition-all duration-300 group-hover:scale-125 group-hover:stroke-white"
                />
                <text
                  x={node.x}
                  y={node.y + (isCenter ? 26 : 20)}
                  textAnchor="middle"
                  fill={isCenter ? "#ffffff" : "#a0a0b8"}
                  fontSize={isCenter ? "11px" : "9.5px"}
                  fontWeight={isCenter ? "bold" : "normal"}
                  className="transition-all duration-300 group-hover:fill-white group-hover:font-semibold pointer-events-none"
                >
                  {node.title.length > 20 ? `${node.title.slice(0, 18)}...` : node.title}
                </text>
              </Link>
            );
          })}
        </svg>

        {/* Floating details box */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-[#0d0d12]/90 backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-xl p-3 min-h-[64px] flex items-center justify-between gap-6 transition-all duration-300">
          {hoveredNode ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase" style={{
                  background: hoveredNode.type === "Wikilink" ? "rgba(99,102,241,0.15)" : hoveredNode.type === "AI Inferred" ? "rgba(16,185,129,0.15)" : "rgba(251,191,36,0.15)",
                  color: hoveredNode.type === "Wikilink" ? "#6366f1" : hoveredNode.type === "AI Inferred" ? "#10b981" : "#fbbf24"
                }}>
                  {hoveredNode.type}
                </span>
                <h4 className="text-xs font-bold text-white truncate">{hoveredNode.title}</h4>
              </div>
              <p className="text-[11px] text-[#8c8ca3] line-clamp-1 mt-0.5">
                {hoveredNode.snippet || "No preview snippet available for this relation."}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[#62627a] py-2">
              <HelpCircle size={14} />
              Hover or tap on any node to preview its relationship context and snippet. Click to navigate.
            </div>
          )}
          {hoveredNode && (
            <Link 
              href={`/wiki?page=${hoveredNode.slug}`}
              className="text-[11px] text-[#8b7ff4] hover:text-white font-bold shrink-0 flex items-center gap-0.5 hover:underline"
            >
              Open Page ➔
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
