"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useFloatingPanelStore, type FloatingPanel } from "@/stores/useFloatingPanelStore";
import { X, Minus, Maximize2, ExternalLink, GripHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

/* ──────────────────────────────────────────────
   Type-to-accent colour map
   ────────────────────────────────────────────── */
const PANEL_COLORS: Record<FloatingPanel["type"], string> = {
  wiki: "#6366f1",
  plan: "#10b981",
  chat: "#8b7ff4",
  task: "#f59e0b",
  ingest: "#06b6d4",
};

const PANEL_LABELS: Record<FloatingPanel["type"], string> = {
  wiki: "Wiki",
  plan: "Plan",
  chat: "Chat",
  task: "Task",
  ingest: "Ingest",
};

/* ──────────────────────────────────────────────
   Single draggable/resizable floating panel
   ────────────────────────────────────────────── */
function FloatingPanelWindow({ panel }: { panel: FloatingPanel }) {
  const { closePanel, updatePanel, bringToFront, minimizePanel } =
    useFloatingPanelStore();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const color = PANEL_COLORS[panel.type];

  /* ---------- drag logic ---------- */
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      bringToFront(panel.id);
      dragState.current = { startX: e.clientX, startY: e.clientY, origX: panel.x, origY: panel.y };

      const onMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const dx = ev.clientX - dragState.current.startX;
        const dy = ev.clientY - dragState.current.startY;
        updatePanel(panel.id, {
          x: Math.max(0, dragState.current.origX + dx),
          y: Math.max(0, dragState.current.origY + dy),
        });
      };
      const onUp = () => {
        dragState.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [panel.id, panel.x, panel.y, bringToFront, updatePanel]
  );

  /* ---------- resize logic ---------- */
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: panel.width,
        origH: panel.height,
      };
      const onMove = (ev: MouseEvent) => {
        if (!resizeState.current) return;
        const dw = ev.clientX - resizeState.current.startX;
        const dh = ev.clientY - resizeState.current.startY;
        updatePanel(panel.id, {
          width: Math.max(360, resizeState.current.origW + dw),
          height: Math.max(240, resizeState.current.origH + dh),
        });
      };
      const onUp = () => {
        resizeState.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [panel.id, panel.width, panel.height, updatePanel]
  );

  if (panel.minimized) {
    return (
      <div
        className="fixed flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg cursor-pointer select-none"
        style={{
          left: panel.x,
          bottom: 20,
          zIndex: panel.zIndex,
          background: "#0d0d12",
          borderColor: color + "40",
        }}
        onClick={() => minimizePanel(panel.id)}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs font-medium text-white/80">{panel.title}</span>
        <button
          onClick={(e) => { e.stopPropagation(); closePanel(panel.id); }}
          className="ml-1 text-white/40 hover:text-white/80 transition-colors"
          aria-label="Close panel"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="fixed flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.zIndex,
        background: "#0a0a0f",
        borderColor: color + "30",
        boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${color}20`,
      }}
      onMouseDown={() => bringToFront(panel.id)}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none shrink-0"
        style={{ background: color + "12", borderBottom: `1px solid ${color}20` }}
        onMouseDown={onDragStart}
      >
        <GripHorizontal size={14} className="opacity-40" style={{ color }} />
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{ background: color + "20", color }}
        >
          {PANEL_LABELS[panel.type]}
        </span>
        <span className="flex-1 text-xs font-semibold text-white/70 truncate">{panel.title}</span>

        {/* Controls */}
        <button
          onClick={() => minimizePanel(panel.id)}
          className="p-1 rounded hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
          title="Minimize"
          aria-label="Minimize panel"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => router.push(panel.url)}
          className="p-1 rounded hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
          title="Open full page"
          aria-label="Open full page"
        >
          <ExternalLink size={12} />
        </button>
        <button
          onClick={() => closePanel(panel.id)}
          className="p-1 rounded hover:bg-red-500/20 transition-colors text-white/40 hover:text-red-300"
          title="Close"
          aria-label="Close panel"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content iframe */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <iframe
          src={panel.url}
          className="w-full h-full border-none bg-transparent"
          title={panel.title}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-center justify-center opacity-30 hover:opacity-70 transition-opacity"
        onMouseDown={onResizeStart}
        aria-label="Resize panel"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-white">
          <path d="M0 10 L10 0 L10 10 Z" />
        </svg>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Minimized panel dock (bottom-right)
   ────────────────────────────────────────────── */
function MinimizedDock() {
  const { panels, minimizePanel, closePanel } = useFloatingPanelStore();
  const minimized = panels.filter((p) => p.minimized);
  if (minimized.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-1.5 z-[900]">
      {minimized.map((p) => {
        const color = PANEL_COLORS[p.type];
        return (
          <div
            key={p.id}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer select-none transition-all hover:scale-105"
            style={{ background: "#0d0d12", borderColor: color + "40" }}
            onClick={() => minimizePanel(p.id)}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />
            <span className="text-xs font-medium text-white/80 max-w-[140px] truncate">{p.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closePanel(p.id); }}
              className="ml-1 text-white/30 hover:text-white/70"
              aria-label="Close panel"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Manager — renders all panels on top of the app
   ────────────────────────────────────────────── */
export function FloatingPanelManager() {
  const { panels } = useFloatingPanelStore();
  const visible = panels.filter((p) => !p.minimized);

  return (
    <>
      {visible.map((panel) => (
        <FloatingPanelWindow key={panel.id} panel={panel} />
      ))}
      <MinimizedDock />
    </>
  );
}

/* ──────────────────────────────────────────────
   Hook — open a panel from anywhere
   ────────────────────────────────────────────── */
export function useOpenPanel() {
  const { openPanel } = useFloatingPanelStore();

  return useCallback(
    (
      type: FloatingPanel["type"],
      title: string,
      url: string,
      opts?: { width?: number; height?: number; x?: number; y?: number }
    ) => {
      openPanel({
        type,
        title,
        url,
        x: opts?.x ?? Math.round(window.innerWidth * 0.15),
        y: opts?.y ?? Math.round(window.innerHeight * 0.1),
        width: opts?.width ?? Math.min(760, window.innerWidth * 0.55),
        height: opts?.height ?? Math.min(580, window.innerHeight * 0.75),
        minimized: false,
      });
    },
    [openPanel]
  );
}
