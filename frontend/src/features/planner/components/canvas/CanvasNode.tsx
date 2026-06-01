"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { CanvasNode as CanvasNodeType } from "../../canvasApi";
import { NodeAIChat } from "./NodeAIChat";
import { useWikiStore } from "@/stores/useWikiStore";

const NODE_META: Record<CanvasNodeType["type"], { label: string; color: string; dim: string }> = {
  task: { label: "Task", color: "#8b7ff4", dim: "rgba(139,127,244,0.1)" },
  wiki: { label: "Wiki", color: "#fbbf24", dim: "rgba(251,191,36,0.1)" },
  member: { label: "Member", color: "#60a5fa", dim: "rgba(96,165,250,0.1)" },
  milestone: { label: "Milestone", color: "#34d399", dim: "rgba(52,211,153,0.1)" },
  trigger: { label: "Trigger", color: "#2dd4bf", dim: "rgba(45,212,191,0.1)" },
  output: { label: "Output", color: "#f87171", dim: "rgba(248,113,113,0.1)" },
};

interface CanvasNodeProps {
  node: CanvasNodeType;
  isSelected: boolean;
  onSelect: (id: string, multi?: boolean) => void;
  onUpdate: (id: string, updates: Partial<CanvasNodeType>) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, clientX: number, clientY: number) => void;
  onConnectStart: (id: string, clientX: number, clientY: number) => void;
  onConnectEnd: (id: string) => void;
  connectingFrom: string | null;
  projectId?: string | null;
}

export function CanvasNodeCard({
  node,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onConnectStart,
  onConnectEnd,
  connectingFrom,
  projectId,
}: CanvasNodeProps) {
  const meta = NODE_META[node.type];
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [showAIChat, setShowAIChat] = useState(false);
  const { currentTeamId } = useWikiStore();

  const handleDoubleClick = () => {
    setEditName((node.meta?.name as string) || "");
    setIsEditing(true);
  };

  const handleNameSubmit = () => {
    onUpdate(node.id, { meta: { ...node.meta, name: editName } });
    setIsEditing(false);
  };

  return (
    <div
      className="absolute rounded-xl overflow-hidden transition-shadow"
      style={{
        ...(node.meta?.is_group ? { outline: `2px solid ${meta.color}44`, outlineOffset: 2 } : {}),
        left: node.x,
        top: node.y,
        width: 260,
        background: "#0d0d12",
        border: `1px solid ${meta.color}22`,
        boxShadow: isSelected
          ? `0 4px 24px rgba(0,0,0,0.5), 0 0 0 2px ${meta.color}44`
          : "0 4px 24px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.07)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
      onClick={(e) => onSelect(node.id, e.ctrlKey || e.metaKey)}
    >
      <div
        className="px-3 py-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing"
        style={{
          background: meta.dim,
          borderBottom: `1px solid ${meta.color}20`,
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button,input,textarea,select")) return;
          e.stopPropagation();
          onDragStart(node.id, e.clientX, e.clientY);
        }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {currentTeamId && projectId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAIChat(!showAIChat);
              }}
              className="text-[#62627a] hover:text-[#8b7ff4] p-0.5 transition-colors"
              title="Ask AI"
            >
              <Sparkles className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            className="text-[#62627a] hover:text-[#a0a0b8] p-0.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        {isEditing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            autoFocus
            className="bg-transparent border-b border-[rgba(255,255,255,0.12)] outline-none text-[13px] font-semibold text-[#eeeef2] pb-0.5 w-full"
          />
        ) : (
          <div
            className="text-[13px] font-semibold text-[#eeeef2] cursor-text"
            onDoubleClick={handleDoubleClick}
          >
            {(node.meta?.name as string) || `${meta.label} Node`}
          </div>
        )}

        <div className="text-[11px] text-[#a0a0b8] leading-relaxed">
          {(node.meta?.purpose as string) || "Double-click to edit"}
        </div>

        {node.type === "task" && (node.meta?.status as string) && (
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background:
                  node.meta.status === "completed"
                    ? "rgba(52,211,153,0.15)"
                    : node.meta.status === "in-progress"
                      ? "rgba(96,165,250,0.15)"
                      : node.meta.status === "blocked"
                        ? "rgba(248,113,113,0.15)"
                        : "rgba(255,255,255,0.07)",
                color:
                  node.meta.status === "completed"
                    ? "#34d399"
                    : node.meta.status === "in-progress"
                      ? "#60a5fa"
                      : node.meta.status === "blocked"
                        ? "#f87171"
                        : "#a0a0b8",
              }}
            >
              {node.meta.status as string}
            </span>
            {(node.meta?.priority as string) && (
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background:
                    node.meta.priority === "high"
                      ? "rgba(248,113,113,0.15)"
                      : node.meta.priority === "medium"
                        ? "rgba(251,191,36,0.15)"
                        : "rgba(96,165,250,0.15)",
                  color:
                    node.meta.priority === "high"
                      ? "#f87171"
                      : node.meta.priority === "medium"
                        ? "#fbbf24"
                        : "#60a5fa",
                }}
              >
                {node.meta.priority as string}
              </span>
            )}
          </div>
        )}

        {node.type === "milestone" && (node.meta?.target_date as string) && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#34d399]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {node.meta.target_date as string}
          </div>
        )}

        {node.type === "member" && (node.meta?.role as string) && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#60a5fa]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {node.meta.role as string}
          </div>
        )}

        {node.type === "wiki" && (node.meta?.summary as string) && (
          <div className="flex items-start gap-1.5 text-[10px] text-[#fbbf24]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.5 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span className="line-clamp-2">{node.meta.summary as string}</span>
          </div>
        )}

        {node.type === "trigger" && (node.meta?.event as string) && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#2dd4bf]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {node.meta.event as string}
          </div>
        )}

        {node.type === "output" && (node.meta?.format as string) && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#f87171]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {node.meta.format as string}
          </div>
        )}

        {node.ref_id && (
          <div className="text-[9px] text-[#62627a] font-mono">
            ref: {node.ref_id.slice(0, 8)}...
          </div>
        )}
      </div>

      <div
        className="absolute -right-[7px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-full cursor-crosshair z-20 flex items-center justify-center transition-all"
        style={{
          background: connectingFrom === node.id ? meta.color : "#1a1a24",
          border: `2px solid ${meta.color}`,
          opacity: connectingFrom === node.id ? 1 : 0.6,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onConnectStart(node.id, e.clientX, e.clientY);
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          onConnectEnd(node.id);
        }}
        title="Drag to connect"
      >
        <div
          className="w-[4px] h-[4px] rounded-full"
          style={{ background: connectingFrom === node.id ? "#fff" : meta.color }}
        />
      </div>

      <div
        className="absolute -left-[7px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full z-20 transition-all"
        style={{
          background: "#1a1a24",
          border: `2px solid ${meta.color}`,
          opacity: 0.5,
        }}
        title="Drop connection here"
      />

      {showAIChat && currentTeamId && projectId && (
        <NodeAIChat
          node={node}
          teamId={currentTeamId}
          projectId={projectId}
          onClose={() => setShowAIChat(false)}
        />
      )}
    </div>
  );
}
