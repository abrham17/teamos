"use client";

import type { CanvasNodeType } from "../../hooks/useCanvas";

const NODE_TYPES: { type: CanvasNodeType; label: string; color: string }[] = [
  { type: "task", label: "Task", color: "#8b7ff4" },
  { type: "milestone", label: "Milestone", color: "#34d399" },
  { type: "member", label: "Member", color: "#60a5fa" },
  { type: "wiki", label: "Wiki", color: "#fbbf24" },
  { type: "trigger", label: "Trigger", color: "#2dd4bf" },
  { type: "output", label: "Output", color: "#f87171" },
];

interface CanvasToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onAddNode: (type: CanvasNodeType) => void;
  onOpenDrawer: (drawer: string) => void;
  activeDrawer: string | null;
  notificationCount: number;
  onSaveTemplate: () => void;
  onLoadTemplate: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
}

export function CanvasToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onAddNode,
  onOpenDrawer,
  activeDrawer,
  notificationCount,
  onSaveTemplate,
  onLoadTemplate,
  onExportJson,
  onImportJson,
}: CanvasToolbarProps) {
  return (
    <>
      <div className="absolute top-3.5 left-3.5 z-20 flex flex-col gap-1">
        <div className="bg-[#0d0d12] border border-[rgba(255,255,255,0.07)] rounded-lg overflow-hidden flex flex-col">
          <button
            onClick={onZoomIn}
            className="bg-transparent border-none p-[7px_9px] cursor-pointer text-[#a0a0b8] hover:text-[#eeeef2] border-b border-[rgba(255,255,255,0.07)] flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM10 7v6M7 10h6" />
            </svg>
          </button>
          <button
            onClick={onZoomOut}
            className="bg-transparent border-none p-[7px_9px] cursor-pointer text-[#a0a0b8] hover:text-[#eeeef2] border-b border-[rgba(255,255,255,0.07)] flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM7 10h6" />
            </svg>
          </button>
          <button
            onClick={onZoomFit}
            className="bg-transparent border-none p-[7px_9px] cursor-pointer text-[#a0a0b8] hover:text-[#eeeef2] flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>
        <span className="text-[9px] text-[#62627a] text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="absolute top-3.5 right-3.5 z-20 bg-[#0d0d12] border border-[rgba(255,255,255,0.07)] rounded-[10px] px-3 py-2 flex items-center gap-2.5">
        <span className="text-[9px] font-bold tracking-wider uppercase text-[#62627a]">Insert</span>
        <div className="w-px h-3.5 bg-[rgba(255,255,255,0.07)]" />
        {NODE_TYPES.map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => onAddNode(type)}
            className="bg-transparent border rounded-md px-2 py-1 cursor-pointer text-[10.5px] font-medium flex items-center gap-1 hover:opacity-80"
            style={{ borderColor: `${color}33`, color }}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-3.5 bg-[rgba(255,255,255,0.07)]" />
        <button
          onClick={onSaveTemplate}
          className="bg-transparent border border-[rgba(255,255,255,0.07)] rounded-md px-2 py-1 cursor-pointer text-[10px] text-[#a0a0b8] hover:text-[#eeeef2]"
          title="Save as template"
        >
          💾 Save
        </button>
        <button
          onClick={onLoadTemplate}
          className="bg-transparent border border-[rgba(255,255,255,0.07)] rounded-md px-2 py-1 cursor-pointer text-[10px] text-[#a0a0b8] hover:text-[#eeeef2]"
          title="Load template"
        >
          📂 Load
        </button>
        <button
          onClick={onExportJson}
          className="bg-transparent border border-[rgba(255,255,255,0.07)] rounded-md px-2 py-1 cursor-pointer text-[10px] text-[#a0a0b8] hover:text-[#eeeef2]"
          title="Export as JSON"
        >
          ⬇️ Export
        </button>
        <button
          onClick={onImportJson}
          className="bg-transparent border border-[rgba(255,255,255,0.07)] rounded-md px-2 py-1 cursor-pointer text-[10px] text-[#a0a0b8] hover:text-[#eeeef2]"
          title="Import JSON"
        >
          ⬆️ Import
        </button>
      </div>
    </>
  );
}
