"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";
import type { CanvasNode as CanvasNodeType } from "../../canvasApi";
import { NodeAIChat } from "./NodeAIChat";
import { useWikiStore } from "@/stores/useWikiStore";
import { useToast } from "@/components/ui/Toast";

const NODE_META: Record<CanvasNodeType["type"], { label: string; color: string; dim: string }> = {
  task: { label: "Task", color: "#8b7ff4", dim: "rgba(139,127,244,0.1)" },
  wiki: { label: "Wiki", color: "#fbbf24", dim: "rgba(251,191,36,0.1)" },
  member: { label: "Member", color: "#60a5fa", dim: "rgba(96,165,250,0.1)" },
  milestone: { label: "Milestone", color: "#34d399", dim: "rgba(52,211,153,0.1)" },
  trigger: { label: "Trigger", color: "#2dd4bf", dim: "rgba(45,212,191,0.1)" },
  output: { label: "Output", color: "#f87171", dim: "rgba(248,113,113,0.1)" },
};

const DEFAULT_WIDTH = 260;

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
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
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
  onContextMenu,
  projectId,
}: CanvasNodeProps) {
  const meta = NODE_META[node.type];
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [showAIChat, setShowAIChat] = useState(false);
  const { currentTeamId } = useWikiStore();
  const { success } = useToast();

  const [conflictResolved, setConflictResolved] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);

  const agentStatus = node.meta?.agent_status as string | undefined;

  useEffect(() => {
    if (agentStatus === "completed") {
      setShowSuccessFlash(true);
      const timer = setTimeout(() => setShowSuccessFlash(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [agentStatus]);

  const w = (node.meta?._width as number) || DEFAULT_WIDTH;

  const handleDoubleClick = () => {
    setEditName((node.meta?.name as string) || "");
    setIsEditing(true);
  };

  const handleNameSubmit = () => {
    onUpdate(node.id, { meta: { ...node.meta, name: editName } });
    setIsEditing(false);
  };

  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: w };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = ev.clientX - resizeRef.current.startX;
      const newWidth = Math.max(200, Math.min(600, resizeRef.current.startW + diff));
      onUpdate(node.id, { meta: { ...node.meta, _width: newWidth } });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [node.id, node.meta, onUpdate, w]);

  // Diff system styling values
  const isCreated = node.meta?.diff_status === "created";
  const isModified = node.meta?.diff_status === "modified";
  const isDeleted = node.meta?.diff_status === "deleted";

  // Active agent color mapping
  const activeAgent = node.meta?.active_agent as string | undefined;
  const agentColor = 
    activeAgent === "researcher" ? "#06b6d4" :
    activeAgent === "strategic_planner" ? "#8b7ff4" :
    activeAgent === "risk_critic" ? "#f59e0b" :
    activeAgent === "supervisor" ? "#ec4899" : null;

  return (
    <div
      className="absolute rounded-xl overflow-hidden transition-all duration-300"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, node.id);
      }}
      style={{
        ...(node.meta?.is_group ? { outline: `2px solid ${meta.color}44`, outlineOffset: 2 } : {}),
        left: node.x,
        top: node.y,
        width: w,
        background: "#0d0d12",
        border: isCreated
          ? "2.5px solid #10b981"
          : isModified
            ? "2.5px solid #fbbf24"
            : isDeleted
              ? "1.5px dashed #4b5563"
              : `1px solid ${meta.color}22`,
        boxShadow: isSelected
          ? `0 4px 24px rgba(0,0,0,0.5), 0 0 0 2px ${isCreated ? "#10b981" : isModified ? "#fbbf24" : meta.color}44`
          : isCreated
            ? "0 4px 20px rgba(16,185,129,0.15)"
            : isModified
              ? "0 4px 20px rgba(251,191,36,0.15)"
              : "0 4px 24px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.07)",
        opacity: isDeleted ? 0.45 : 1,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
      onClick={(e) => onSelect(node.id, e.ctrlKey || e.metaKey)}
    >
      <div
        className="px-3 py-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing"
        style={{
          background: isCreated ? "rgba(16,185,129,0.08)" : isModified ? "rgba(251,191,36,0.08)" : meta.dim,
          borderBottom: `1px solid ${isCreated ? "rgba(16,185,129,0.2)" : isModified ? "rgba(251,191,36,0.2)" : `${meta.color}20`}`,
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button,input,textarea,select")) return;
          e.stopPropagation();
          onDragStart(node.id, e.clientX, e.clientY);
        }}
      >
        <div className="flex items-center gap-2">
          {/* Agent Avatar / Pulse Status indicator */}
          {agentColor && (
            <div className="relative flex items-center justify-center">
              <span 
                className="w-2.5 h-2.5 rounded-full block animate-ping absolute"
                style={{ background: agentColor }}
              />
              <span 
                className="w-2 h-2 rounded-full block relative z-10 border border-[#0d0d12]"
                style={{ background: agentColor }}
                title={`${activeAgent} is active on this node`}
              />
            </div>
          )}
          
          {agentStatus === "completed" && (
            <span className="text-[#10b981] text-xs font-bold" title="Agent finished work here">✓</span>
          )}

          <span
            className="text-[10px] font-semibold tracking-wider uppercase flex items-center gap-1.5"
            style={{ color: isCreated ? "#10b981" : isModified ? "#fbbf24" : meta.color }}
          >
            {meta.label}
            {isCreated && <span className="text-[8px] bg-[#10b981]/20 text-[#10b981] px-1 rounded font-bold uppercase">New</span>}
            {isModified && <span className="text-[8px] bg-[#fbbf24]/20 text-[#fbbf24] px-1 rounded font-bold uppercase">Mod</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Boolean(node.meta?.conflict) && !conflictResolved && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConflictModal(true);
              }}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-black cursor-pointer hover:bg-rose-500/25 transition-all mr-1"
              title="Agent Conflict Detected - Click to Resolve"
            >
              <span className="w-1 h-1 rounded-full bg-[#8b7ff4]" />
              /
              <span className="w-1 h-1 rounded-full bg-[#f59e0b]" />
              Conflict
            </button>
          )}
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
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1"
              style={{
                background:
                  node.meta.status === "completed" || node.meta.status === "complete"
                    ? "rgba(52,211,153,0.15)"
                    : node.meta.status === "in-progress" || node.meta.status === "on track"
                      ? "rgba(96,165,250,0.15)"
                      : node.meta.status === "blocked" || node.meta.status === "at risk"
                        ? "rgba(248,113,113,0.15)"
                        : node.meta.status === "overdue"
                          ? "rgba(239,68,68,0.2)"
                          : "rgba(255,255,255,0.07)",
                color:
                  node.meta.status === "completed" || node.meta.status === "complete"
                    ? "#34d399"
                    : node.meta.status === "in-progress" || node.meta.status === "on track"
                      ? "#60a5fa"
                      : node.meta.status === "blocked" || node.meta.status === "at risk"
                        ? "#fbbf24"
                        : node.meta.status === "overdue"
                          ? "#f87171"
                          : "#a0a0b8",
              }}
            >
              <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
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

        {/* Reasoning Trace indicator (Brain icon) at bottom right of the card */}
        {Boolean(node.meta?.reasoning_trace || node.meta?.purpose) && (
          <div className="flex justify-end pt-1 border-t border-[rgba(255,255,255,0.04)]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
              }}
              className="text-[#62627a] hover:text-[#8b7ff4] p-1 rounded hover:bg-white/5 transition-all flex items-center gap-1 text-[9px] font-semibold"
              title="Show Reasoning Trace"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-4.12 2.5 2.5 0 0 1 0-4.12A2.5 2.5 0 0 1 9.5 2Z" />
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-4.12 2.5 2.5 0 0 0 0-4.12A2.5 2.5 0 0 0 14.5 2Z" />
              </svg>
              Reasoning Trace
            </button>
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

      {isSelected && (
        <div
          className="absolute -bottom-[5px] -right-[5px] w-[12px] h-[12px] rounded-br-sm cursor-se-resize z-20"
          style={{ background: meta.color, opacity: 0.6 }}
          onMouseDown={handleResizeStart}
          title="Resize"
        />
      )}

      {showAIChat && currentTeamId && projectId && (
        <NodeAIChat
          node={node}
          teamId={currentTeamId}
          projectId={projectId}
          onClose={() => setShowAIChat(false)}
        />
      )}

      {/* Success completion flash animation overlay */}
      {showSuccessFlash ? (
        <div className="absolute inset-0 bg-[#10b981]/15 border border-[#10b981]/40 rounded-xl flex items-center justify-center pointer-events-none z-30 animate-out fade-out duration-1000">
          <div className="bg-[#0d0d12] border border-[#10b981]/30 rounded-lg px-2.5 py-1 flex items-center gap-1.5 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping" />
            <span className="text-[10px] font-bold text-[#10b981] uppercase tracking-wider">Agent Resolved</span>
          </div>
        </div>
      ) : null}

      {/* Conflict Resolution Overlay */}
      {showConflictModal && node.meta?.conflict ? (
        <div 
          className="absolute inset-0 bg-[#0d0d12]/95 backdrop-blur-sm z-30 flex flex-col p-3 text-xs justify-between border border-rose-500/30 rounded-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-white/5 pb-1">
              <span className="font-bold text-rose-400 uppercase tracking-widest text-[9px]">AI Agent Conflict</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowConflictModal(false); }} 
                className="text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-indigo-300 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8b7ff4]" />
                Planner proposed:
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] pl-2.5 leading-relaxed">
                {(node.meta.conflict as Record<string, unknown>).proposer_proposal}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                Risk Critic objected:
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] pl-2.5 leading-relaxed">
                {(node.meta.conflict as Record<string, unknown>).objector_objection}
              </p>
            </div>
          </div>
          <div className="space-y-1.5 pt-2">
            {(((node.meta.conflict as Record<string, unknown>).options || []) as Array<Record<string, unknown>>).map((opt) => (
              <button
                key={opt.key}
                onClick={(e) => {
                  e.stopPropagation();
                  setConflictResolved(true);
                  setShowConflictModal(false);
                  if (opt.key === "objector") {
                    onUpdate(node.id, {
                      meta: {
                        ...node.meta,
                        name: (node.meta?.name || "").toString().replace("Week 3", "Week 4"),
                        purpose: "Adjusted post risk-critic review: Postponed launch to Week 4 (Strategic delay)"
                      }
                    });
                  }
                  success(`Conflict resolved: ${opt.label}`);
                }}
                className="w-full text-left p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-[9px] text-[var(--text-primary)] hover:border-[var(--accent)] transition-all cursor-pointer font-medium leading-tight"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
