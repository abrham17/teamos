"use client";

import { useEffect, useRef } from "react";
import type { CanvasNodeType } from "../../hooks/useCanvas";

const NODE_TYPES: { type: CanvasNodeType; label: string; color: string }[] = [
  { type: "task", label: "Task", color: "#8b7ff4" },
  { type: "milestone", label: "Milestone", color: "#34d399" },
  { type: "member", label: "Member", color: "#60a5fa" },
  { type: "wiki", label: "Wiki", color: "#fbbf24" },
  { type: "trigger", label: "Trigger", color: "#2dd4bf" },
  { type: "output", label: "Output", color: "#f87171" },
];

export interface ContextMenuTarget {
  kind: "node" | "edge" | "canvas";
  nodeId?: string;
  edgeId?: string;
  x: number;
  y: number;
  nodeType?: CanvasNodeType;
}

interface CanvasContextMenuProps {
  target: ContextMenuTarget;
  onClose: () => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onChangeType: (id: string, newType: CanvasNodeType) => void;
  onAddNode: (type: CanvasNodeType, x: number, y: number) => void;
  onDeleteEdge: () => void;
  onZoomToNode: (id: string) => void;
  onLinkNode: (id: string) => void;
  onSelectAll: () => void;
}

export function CanvasContextMenu({
  target,
  onClose,
  onDeleteNode,
  onDuplicateNode,
  onChangeType,
  onAddNode,
  onDeleteEdge,
  onZoomToNode,
  onLinkNode,
  onSelectAll,
}: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  const items: { label: string; action?: () => void; danger?: boolean; shortcut?: string; sub?: boolean }[] = [];

  if (target.kind === "node" && target.nodeId) {
    items.push({ label: "Zoom to", action: () => onZoomToNode(target.nodeId!) });
    items.push({ label: "Link entity", action: () => onLinkNode(target.nodeId!) });
    items.push({ label: "Duplicate", action: () => onDuplicateNode(target.nodeId!), shortcut: "Ctrl+D" });
    items.push({ label: "Change type", sub: true });
    items.push({ label: "Delete", action: () => onDeleteNode(target.nodeId!), danger: true, shortcut: "Del" });
  }

  if (target.kind === "edge") {
    items.push({ label: "Delete edge", action: onDeleteEdge, danger: true, shortcut: "Del" });
  }

  if (target.kind === "canvas") {
    items.push({ label: "Select all", action: onSelectAll, shortcut: "Ctrl+A" });
    items.push({ label: "Add node", sub: true });
  }

  if (items.length === 0) return null;

  if (items.length === 0) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[200] bg-[#0d0d12] border border-[rgba(255,255,255,0.1)] rounded-lg py-1 min-w-[160px] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-[8px]"
      style={{ left: Math.min(target.x, window.innerWidth - 180), top: Math.min(target.y, window.innerHeight - 300) }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.sub ? (
            <div className="px-2 py-0.5">
              <div className="text-[8px] font-bold uppercase tracking-wider text-[#62627a] px-2 py-0.5">
                {item.label === "Change type" ? "Change type" : "Insert node"}
              </div>
              {(item.label === "Change type" ? NODE_TYPES : NODE_TYPES).map((nt) => (
                <button
                  key={nt.type}
                  onClick={() => {
                    if (item.label === "Change type" && target.nodeId) {
                      onChangeType(target.nodeId, nt.type);
                    } else if (item.label === "Add node") {
                      onAddNode(nt.type, target.x, target.y);
                    }
                    onClose();
                  }}
                  className="w-full text-left px-2.5 py-1 text-[11px] rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors flex items-center gap-2"
                  style={{ color: nt.color }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: nt.color }} />
                  {nt.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => {
                item.action?.();
                onClose();
              }}
              className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between hover:bg-[rgba(255,255,255,0.06)] transition-colors ${
                item.danger ? "text-[#f87171]" : "text-[#eeeef2]"
              }`}
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="text-[9px] text-[#62627a] ml-4">{item.shortcut}</span>
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
