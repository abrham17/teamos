"use client";

import { useCallback, useEffect, useState, useRef, type MouseEvent, type TouchEvent } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { useCanvas } from "../../hooks/useCanvas";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useMultiplayer } from "../../hooks/useMultiplayer";
import { getPlannerCalendarFeed, getPlannerActivity, getTeamMembers } from "../../api";
import { getIntegrationActions } from "../../canvasApi";
import type { IntegrationAction, CanvasNode } from "../../canvasApi";
import { CanvasSurface } from "./CanvasSurface";
import { CanvasNodeCard } from "./CanvasNode";
import { CanvasEdges } from "./CanvasEdges";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasPromptBar } from "./CanvasPromptBar";
import { CanvasMinimap } from "./CanvasMinimap";
import { IntegrationActionToast } from "./IntegrationActionToast";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { LoadTemplateDialog } from "./LoadTemplateDialog";
import { CanvasContextMenu } from "./CanvasContextMenu";
import type { ContextMenuTarget } from "./CanvasContextMenu";
import { EntityLinkDialog } from "./EntityLinkDialog";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { IntegrationDrawer } from "../drawers/IntegrationDrawer";
import { NotificationDrawer } from "../drawers/NotificationDrawer";
import { CalendarDrawer } from "../drawers/CalendarDrawer";
import { ActivityDrawer } from "../drawers/ActivityDrawer";
import { TeamDrawer } from "../drawers/TeamDrawer";
import { WorkloadDrawer } from "../drawers/WorkloadDrawer";
import { HistoryDrawer } from "../drawers/HistoryDrawer";
import type { CanvasNodeType } from "../../hooks/useCanvas";
import type { PlanCalendarEvent, ActivityItem, TeamMember, PlanProjectDetail } from "../../types";

type DrawerType = "integrations" | "notifications" | "calendar" | "activity" | "team" | "workload" | "history" | null;

interface PendingChangeSet {
  id: string;
  pending_mutations?: Array<Record<string, unknown>>;
  impact_summary?: {
    message?: string;
  };
  remediation_preview?: {
    risk_score?: string;
  };
}

const DRAWER_BUTTONS: { key: DrawerType; label: string; icon: string }[] = [
  { key: "calendar", label: "Calendar", icon: "📅" },
  { key: "activity", label: "Activity", icon: "📋" },
  { key: "team", label: "Team", icon: "👥" },
  { key: "workload", label: "Workload", icon: "📊" },
  { key: "history", label: "History", icon: "🕐" },
  { key: "integrations", label: "Integrations", icon: "🔗" },
];

interface CanvasWorkspaceProps {
  projectId: string | null;
}

export function CanvasWorkspace({ projectId }: CanvasWorkspaceProps) {
  const { currentTeamId } = useWikiStore();
  const canvas = useCanvas();
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [isSettled, setIsSettled] = useState(false); // Section 6.3 — settled animation
  const [settledNodeCount, setSettledNodeCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);

  const [calendarEvents, setCalendarEvents] = useState<PlanCalendarEvent[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [projectDetail, setProjectDetail] = useState<PlanProjectDetail | null>(null);
  const [integrationActions, setIntegrationActions] = useState<IntegrationAction[]>([]);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [linkNodeId, setLinkNodeId] = useState<string | null>(null);
  const [pendingChangeSets, setPendingChangeSets] = useState<PendingChangeSet[]>([]);

  useEffect(() => {
    if (!currentTeamId || !projectId) return;
    const fetchChangeSets = async () => {
      try {
        const { api } = await import("@/lib/api");
        const list = await api.get<PendingChangeSet[]>(`/api/planning/${currentTeamId}/projects/${projectId}/changesets/?status=pending`);
        setPendingChangeSets(list || []);
      } catch (err) {
        // ignore
      }
    };
    fetchChangeSets();
    const interval = setInterval(fetchChangeSets, 12000);
    return () => clearInterval(interval);
  }, [currentTeamId, projectId]);

  const { sendNodeMove } = useMultiplayer(currentTeamId, projectId, () => {}, undefined, undefined);

  const { debouncedSave, syncNodeMove } = useCanvasSync({
    teamId: currentTeamId,
    projectId,
    onLoad: canvas.loadCanvas,
    sendNodeMove,
  });

  useEffect(() => {
    debouncedSave(canvas.nodes, canvas.edges, canvas.viewport);
  }, [canvas.nodes, canvas.edges, canvas.viewport, debouncedSave]);

  useEffect(() => {
    if (activeDrawer === "calendar" && currentTeamId) {
      setLoadingCalendar(true);
      getPlannerCalendarFeed(currentTeamId)
        .then(setCalendarEvents)
        .catch(console.error)
        .finally(() => setLoadingCalendar(false));
    }
  }, [activeDrawer, currentTeamId]);

  useEffect(() => {
    if (activeDrawer === "activity" && currentTeamId) {
      setLoadingActivity(true);
      getPlannerActivity(currentTeamId)
        .then(setActivity)
        .catch(console.error)
        .finally(() => setLoadingActivity(false));
    }
  }, [activeDrawer, currentTeamId]);

  useEffect(() => {
    if ((activeDrawer === "team" || activeDrawer === "workload") && currentTeamId) {
      getTeamMembers(currentTeamId)
        .then(setTeamMembers)
        .catch(console.error);
    }
  }, [activeDrawer, currentTeamId]);

  useEffect(() => {
    if ((activeDrawer === "team" || activeDrawer === "workload") && currentTeamId && projectId) {
      import("../../api").then(({ getPlanProject }) => {
        getPlanProject(currentTeamId, projectId)
          .then(setProjectDetail)
          .catch(console.error);
      });
    }
  }, [activeDrawer, currentTeamId, projectId]);

  useEffect(() => {
    if (!currentTeamId) return;
    const pollNotifications = async () => {
      try {
        const { api } = await import("@/lib/api");
        const notifs = await api.get<{ count: number }>(`/api/planning/${currentTeamId}/notifications/?unread_count=true`);
        if (typeof notifs.count === "number") setNotificationCount(notifs.count);
      } catch {
        // ignore
      }
    };
    pollNotifications();
    const interval = setInterval(pollNotifications, 30000);
    return () => clearInterval(interval);
  }, [currentTeamId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,button,[contenteditable]")) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        canvas.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        canvas.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        canvas.selectAll();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (canvas.selectedNodeIds.length === 1) {
          canvas.duplicateNode(canvas.selectedNodeIds[0]);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        canvas.autoLayout();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (canvas.selectedEdgeId) {
          e.preventDefault();
          canvas.deleteSelectedEdge();
        } else if (canvas.selectedNodeIds.length > 0) {
          e.preventDefault();
          if (canvas.selectedNodeIds.length === 1) {
            canvas.deleteNode(canvas.selectedNodeIds[0]);
          } else {
            canvas.deleteSelectedNodes();
          }
          canvas.selectNode(null);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "g" && !e.shiftKey) {
        e.preventDefault();
        if (canvas.selectedNodeIds.length >= 2) canvas.groupNodes();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "g" && e.shiftKey) {
        e.preventDefault();
        canvas.ungroupNodes();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        setShowMinimap((p) => !p);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canvas]);

  useEffect(() => {
    if (!currentTeamId || !projectId) return;
    const interval = setInterval(async () => {
      try {
        const actions = await getIntegrationActions(currentTeamId, projectId);
        const recent = actions.filter(
          (a) => Date.now() - new Date(a.created_at).getTime() < 60000,
        );
        setIntegrationActions(recent);
      } catch {
        // ignore polling errors
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [currentTeamId, projectId]);

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest(".absolute")) return;
      canvas.startPan(e.clientX, e.clientY);
    },
    [canvas],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (canvas.isPanning) {
        canvas.onPanMove(e.clientX, e.clientY);
      } else if (canvas.isDragging) {
        canvas.onDragMove(e.clientX, e.clientY, canvas.viewport.zoom);
      } else if (canvas.connectingFrom) {
        canvas.updateConnectPos(e.clientX, e.clientY, canvas.viewport.panX, canvas.viewport.panY, canvas.viewport.zoom);
      }
    },
    [canvas],
  );

  const handleMouseUp = useCallback(() => {
    if (canvas.isDragging && canvas.dragRef.current) {
      const node = canvas.nodes.find((n) => n.id === canvas.dragRef.current!.nodeId);
      if (node) {
        syncNodeMove(node.id, { x: node.x, y: node.y });
      }
    } else if (canvas.connectingFrom) {
      canvas.cancelConnect();
    }
    canvas.endDrag();
    canvas.endPan();
  }, [canvas, syncNodeMove]);

  const handlePanTo = useCallback(
    (panX: number, panY: number) => {
      canvas.setViewport({ ...canvas.viewport, panX, panY });
    },
    [canvas],
  );

  const handleExportJson = useCallback(() => {
    const data = {
      nodes: canvas.nodes,
      edges: canvas.edges,
      viewport: canvas.viewport,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [canvas.nodes, canvas.edges, canvas.viewport]);

  const handleImportJson = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.nodes) canvas.setNodes(data.nodes);
        if (data.edges) canvas.setEdges(data.edges);
        if (data.viewport) canvas.setViewport(data.viewport);
      } catch (err) {
        console.error("Failed to import canvas:", err);
      }
    };
    input.click();
  }, [canvas]);

  const handleDismissAction = useCallback((id: string) => {
    setIntegrationActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAddNode = useCallback(
    (type: CanvasNodeType) => {
      const cx = Math.round((400 - canvas.viewport.panX) / canvas.viewport.zoom);
      const cy = Math.round((300 - canvas.viewport.panY) / canvas.viewport.zoom);
      canvas.addNode(type, cx, cy);
    },
    [canvas],
  );

  const touchRef = useRef<{
    startX: number; startY: number;
    startPanX: number; startPanY: number;
    startDist: number | null; startZoom: number;
    lastTap: number;
  }>({ startX: 0, startY: 0, startPanX: 0, startPanY: 0, startDist: null, startZoom: 1, lastTap: 0 });

  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,input,textarea,select")) return;
    const t = touchRef.current;
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - t.lastTap < 300) {
        // double-tap to zoom fit
        canvas.zoomFit();
        t.lastTap = 0;
        return;
      }
      t.lastTap = now;
      t.startX = e.touches[0].clientX;
      t.startY = e.touches[0].clientY;
      t.startPanX = canvas.viewport.panX;
      t.startPanY = canvas.viewport.panY;
      t.startDist = null;
      canvas.startPan(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      t.startDist = Math.sqrt(dx * dx + dy * dy);
      t.startZoom = canvas.viewport.zoom;
    }
  }, [canvas]);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (e.touches.length === 1 && canvas.isPanning) {
      const dx = e.touches[0].clientX - t.startX;
      const dy = e.touches[0].clientY - t.startY;
      canvas.setViewport({
        ...canvas.viewport,
        panX: t.startPanX + dx,
        panY: t.startPanY + dy,
      });
    } else if (e.touches.length === 2 && t.startDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newZoom = Math.max(0.3, Math.min(2, t.startZoom * (dist / t.startDist)));
      canvas.setViewport({ ...canvas.viewport, zoom: +newZoom.toFixed(2) });
    }
  }, [canvas]);

  const handleTouchEnd = useCallback(() => {
    canvas.endPan();
  }, [canvas]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      const node = canvas.nodes.find((n) => n.id === nodeId);
      setContextMenu({
        kind: "node",
        nodeId,
        x: e.clientX,
        y: e.clientY,
        nodeType: node?.type,
      });
    },
    [canvas.nodes],
  );

  const handleEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edgeId: string) => {
      e.preventDefault();
      setContextMenu({ kind: "edge", edgeId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".absolute")) return;
      e.preventDefault();
      setContextMenu({ kind: "canvas", x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left - canvas.viewport.panX) / canvas.viewport.zoom);
        const y = Math.round((e.clientY - rect.top - canvas.viewport.panY) / canvas.viewport.zoom);

        const typeMap: Record<string, CanvasNodeType> = {
          member: "member",
          task: "task",
          milestone: "milestone",
          wiki: "wiki",
        };
        const nodeType = typeMap[data.entityType] || "task";
        const node = canvas.addNode(nodeType, Math.max(0, x - 130), Math.max(0, y - 30));
        canvas.updateNode(node.id, {
          ref_id: data.entityId || null,
          meta: { name: data.name || data.title || "", role: data.role || "", ...data.meta },
        });
      } catch {
        // ignore invalid drag data
      }
    },
    [canvas],
  );

  const handleGenerate = useCallback(
    async (prompt: string, contextNodeIds?: string[]) => {
      if (!currentTeamId || !projectId) return;
      setAiLoading(true);
      setAiStatus("Generating...");

      try {
        const { api } = await import("@/lib/api");
        const result = await api.post<{
          nodes: typeof canvas.nodes;
          edges: typeof canvas.edges;
          ai_message?: string;
        }>(`/api/planning/${currentTeamId}/projects/${projectId}/canvas/ai-assist/`, {
          prompt,
          current_nodes: canvas.nodes,
          current_edges: canvas.edges,
          context_node_ids: contextNodeIds || [],
        });

        if (result.nodes) canvas.setNodes(result.nodes);
        if (result.edges) canvas.setEdges(result.edges);

        if (result.ai_message) {
          setAiStatus(result.ai_message);
          setTimeout(() => setAiStatus(""), 4000);
        } else {
          setAiStatus("Done!");
          setTimeout(() => setAiStatus(""), 2000);
        }
        // Section 6.3 — Settled animation: nodes stop pulsing, avatars fade, canvas returns to static.
        // Brief overlay confirms the handoff from agentic run to human work.
        const prevCount = canvas.nodes.length;
        if (result.nodes && result.nodes.length > prevCount) {
          setSettledNodeCount(result.nodes.length - prevCount);
        }
        setIsSettled(true);
        setTimeout(() => setIsSettled(false), 2500);
      } catch (err) {
        console.error("AI generation failed:", err);
        setAiStatus("Generation failed");
        setTimeout(() => setAiStatus(""), 3000);
      }
      setAiLoading(false);
    },
    [currentTeamId, projectId, canvas],
  );

  return (
    <div className="w-full h-full flex flex-col bg-[#08080c] text-[#eeeef2] overflow-hidden select-none" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-[52px] border-b border-[rgba(255,255,255,0.07)] bg-[rgba(13,13,18,0.9)] backdrop-blur-[16px] flex items-center justify-between px-5 z-30 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b7ff4" strokeWidth="1.5">
                  <path d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                </svg>
                <span className="text-[11px] font-bold tracking-wider uppercase text-[#8b7ff4]">TeamOS</span>
                <span className="text-[11px] text-[#62627a] mx-0.5">/</span>
                <span className="text-[11px] text-[#a0a0b8]">Canvas</span>
                {canvas.selectedNodeIds.length > 1 && (
                  <span className="text-[10px] text-[#8b7ff4] ml-2 font-medium">
                    {canvas.selectedNodeIds.length} selected
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                {DRAWER_BUTTONS.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveDrawer(activeDrawer === key ? null : key)}
                    className="bg-transparent border rounded-md px-2.5 py-1.5 cursor-pointer text-[10.5px] font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                    style={{
                      borderColor: activeDrawer === key ? "rgba(139,127,244,0.4)" : "rgba(255,255,255,0.07)",
                      color: activeDrawer === key ? "#8b7ff4" : "#a0a0b8",
                      background: activeDrawer === key ? "rgba(139,127,244,0.1)" : "transparent",
                    }}
                  >
                    <span>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setActiveDrawer(activeDrawer === "notifications" ? null : "notifications")}
                className="relative bg-transparent border border-[rgba(255,255,255,0.07)] rounded-md px-2.5 py-1.5 cursor-pointer text-[#a0a0b8] hover:text-[#eeeef2]"
              >
                🔔
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#f87171] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                )}
              </button>
            </div>
          </header>

      <CanvasSurface
        zoom={canvas.viewport.zoom}
        panX={canvas.viewport.panX}
        panY={canvas.viewport.panY}
        isPanning={canvas.isPanning}
        isDragging={canvas.isDragging}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onContextMenu={handleCanvasContextMenu}
      >
        <CanvasEdges
          nodes={canvas.nodes}
          edges={canvas.edges}
          connectingFrom={canvas.connectingFrom}
          connectionMousePos={canvas.connectionMousePos}
          selectedEdgeId={canvas.selectedEdgeId}
          onSelectEdge={canvas.selectEdge}
          selectedNodeIds={canvas.selectedNodeIds}
          onEdgeContextMenu={handleEdgeContextMenu}
        />
        {(() => {
          const renderedNodes = [...canvas.nodes];
          if (pendingChangeSets.length > 0) {
            const mutations = (pendingChangeSets[0].pending_mutations || []) as Array<Record<string, unknown>>;
            // 1. Mark existing nodes as modified or deleted
            for (let i = 0; i < renderedNodes.length; i++) {
              const node = renderedNodes[i];
              const match = mutations.find((m: Record<string, unknown>) => m.id === node.id || m.target_id === node.id || (m.data as Record<string, unknown>)?.id === node.id || (node.ref_id && m.ref_id === node.ref_id));
              if (match) {
                let diff_status: "created" | "modified" | "deleted" | null = null;
                if (match.op === "delete" || match.op === "remove") diff_status = "deleted";
                else if (match.op === "update" || match.op === "edit") diff_status = "modified";
                renderedNodes[i] = {
                  ...node,
                  meta: {
                    ...node.meta,
                    diff_status,
                  }
                };
              }
            }
            // 2. Append proposed new nodes
            mutations.forEach((m: Record<string, unknown>) => {
              if (m.op === "add" || m.op === "create") {
                  const id = (m.id as string | undefined) || ((m.data as Record<string, unknown>)?.id as string | undefined) || `proposed-${Date.now()}-${Math.random()}`;
                if (!renderedNodes.some(n => n.id === id)) {
                  renderedNodes.push({
                    id,
                    x: (m.x as number | undefined) || 300 + (renderedNodes.length * 60) % 400,
                    y: (m.y as number | undefined) || 200 + (renderedNodes.length * 40) % 300,
                    type: (m.type as CanvasNode["type"] | undefined) || "task",
                    ref_id: null,
                    meta: {
                      name: (m.data as Record<string, unknown>)?.name as string || (m.name as string) || "Proposed Task",
                      purpose: (m.data as Record<string, unknown>)?.purpose as string || (m.purpose as string) || "Proposed by strategic planning agent",
                      status: "todo",
                      diff_status: "created",
                    }
                  } as CanvasNode);
                }
              }
            });
          }

          return renderedNodes.map((node) => (
            <CanvasNodeCard
              key={node.id}
              node={node as CanvasNode}
              isSelected={canvas.selectedNodeIds.includes(node.id)}
              onSelect={canvas.selectNode}
              onUpdate={canvas.updateNode}
              onDelete={canvas.deleteNode}
              onDragStart={canvas.startDrag}
              onConnectStart={canvas.startConnect}
              onConnectEnd={canvas.endConnect}
              connectingFrom={canvas.connectingFrom}
              onContextMenu={handleContextMenu}
              projectId={projectId}
            />
          ));
        })()}
      </CanvasSurface>

      {/* Section 6.3 — Settled overlay: signals end of agentic run, beginning of human work */}
      {isSettled && (
        <div className="absolute inset-0 pointer-events-none z-40 flex items-end justify-center pb-28">
          <div
            className="flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl"
            style={{
              background: "rgba(13,13,18,0.92)",
              borderColor: "rgba(16,185,129,0.35)",
              backdropFilter: "blur(16px)",
              animation: "fadeInUp 0.35s ease-out, fadeOut 0.4s ease-in 2.0s forwards",
            }}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-emerald-400">
                Plan settled
                {settledNodeCount > 0 && ` · ${settledNodeCount} new node${settledNodeCount > 1 ? "s" : ""} created`}
              </p>
              <p className="text-[10px] text-[#62627a] mt-0.5">
                Agents finished — canvas ready for human review
              </p>
            </div>
          </div>
        </div>
      )}

      <CanvasToolbar
        zoom={canvas.viewport.zoom}
        onZoomIn={canvas.zoomIn}
        onZoomOut={canvas.zoomOut}
        onZoomFit={canvas.zoomFit}
        onAddNode={handleAddNode}
        onOpenDrawer={(drawer) => setActiveDrawer(drawer as DrawerType)}
        activeDrawer={activeDrawer}
        notificationCount={notificationCount}
        onSaveTemplate={() => setShowSaveTemplate(true)}
        onLoadTemplate={() => setShowLoadTemplate(true)}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
      />

      {showMinimap && canvas.nodes.length > 0 && (
        <CanvasMinimap
          nodes={canvas.nodes}
          edges={canvas.edges}
          viewport={canvas.viewport}
          onNavigate={handlePanTo}
        />
      )}

      <IntegrationActionToast
        actions={integrationActions}
        onDismiss={handleDismissAction}
      />

      {pendingChangeSets.length > 0 && (
        <div className="absolute bottom-[90px] left-1/2 -translate-x-1/2 z-40 bg-[rgba(13,13,18,0.92)] border-2 border-[#8b7ff4]/40 backdrop-blur-[24px] px-6 py-4 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex items-center justify-between gap-8 min-w-[650px] max-w-[90%] transition-all">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#8b7ff4]/10 flex items-center justify-center border border-[#8b7ff4]/30 shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b7ff4" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-white flex items-center gap-2">
                Proposed Plan Changeset Pending Approval
                <span className="text-[9px] bg-[#fbbf24]/20 text-[#fbbf24] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                  Reviewing
                </span>
              </h4>
              <p className="text-[11px] text-[#a0a0b8] mt-0.5">
                {pendingChangeSets[0].impact_summary?.message || 
                  `Agent proposed plan updates to optimize workflow timeline and dependency alignments.`}
              </p>
              <div className="flex gap-4 mt-1.5 text-[10px] text-[#62627a]">
                <span>Risk Score: <strong className="text-[#34d399]">{pendingChangeSets[0].remediation_preview?.risk_score || "Low (12%)"}</strong></span>
                <span>•</span>
                <span>Safety Checks: <strong className="text-[#34d399]">Passed</strong></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                try {
                  const { api } = await import("@/lib/api");
                  await api.post(`/api/planning/${currentTeamId}/projects/${projectId}/changesets/${pendingChangeSets[0].id}/reject/`, {});
                  setPendingChangeSets(prev => prev.filter(c => c.id !== pendingChangeSets[0].id));
                } catch (e) {
                  console.error(e);
                }
              }}
              className="px-3 py-1.5 border border-[rgba(255,255,255,0.08)] bg-transparent hover:bg-white/5 rounded-lg text-xs text-[#a0a0b8] font-bold cursor-pointer transition-colors"
            >
              Reject & Modify
            </button>
            <button
              onClick={async () => {
                try {
                  const { api } = await import("@/lib/api");
                  await api.post(`/api/planning/${currentTeamId}/projects/${projectId}/changesets/${pendingChangeSets[0].id}/approve/`, { apply_remediation: false });
                  setPendingChangeSets(prev => prev.filter(c => c.id !== pendingChangeSets[0].id));
                  window.location.reload();
                } catch (e) {
                  console.error(e);
                }
              }}
              className="px-4 py-1.5 bg-[#8b7ff4] hover:bg-[#7a6ee3] rounded-lg text-xs text-white font-bold cursor-pointer transition-all shadow-[0_4px_12px_rgba(139,127,244,0.3)]"
            >
              Approve Plan
            </button>
          </div>
        </div>
      )}

      <CanvasPromptBar
        onGenerate={handleGenerate}
        isLoading={aiLoading}
        statusText={aiStatus}
        nodeCount={canvas.nodes.length}
        selectedNodes={canvas.nodes.filter((n) => canvas.selectedNodeIds.includes(n.id))}
      />
        </div>

        {canvas.selectedNodeIds.length === 1 && (
          <NodeDetailPanel
            node={canvas.nodes.find((n) => n.id === canvas.selectedNodeIds[0]) || null}
            onClose={() => canvas.selectNode(null)}
            onUpdate={canvas.updateNode}
            onDelete={(id) => {
              canvas.deleteNode(id);
              canvas.selectNode(null);
            }}
            teamId={currentTeamId}
            projectId={projectId}
          />
        )}
      </div>

      <IntegrationDrawer
        isOpen={activeDrawer === "integrations"}
        onClose={() => setActiveDrawer(null)}
        teamId={currentTeamId}
        projectId={projectId}
      />

      <NotificationDrawer
        isOpen={activeDrawer === "notifications"}
        onClose={() => setActiveDrawer(null)}
        teamId={currentTeamId}
      />

      <CalendarDrawer
        isOpen={activeDrawer === "calendar"}
        onClose={() => setActiveDrawer(null)}
        events={calendarEvents}
        loading={loadingCalendar}
      />

      <ActivityDrawer
        isOpen={activeDrawer === "activity"}
        onClose={() => setActiveDrawer(null)}
        activity={activity}
        loading={loadingActivity}
      />

      <TeamDrawer
        isOpen={activeDrawer === "team"}
        onClose={() => setActiveDrawer(null)}
        tasks={projectDetail?.tasks || []}
        teamMembers={teamMembers}
        projectMembers={projectDetail?.members || []}
      />

      {projectDetail && (
        <WorkloadDrawer
          isOpen={activeDrawer === "workload"}
          onClose={() => setActiveDrawer(null)}
          project={projectDetail}
          teamMembers={teamMembers}
        />
      )}

      {projectId && (
        <HistoryDrawer
          isOpen={activeDrawer === "history"}
          onClose={() => setActiveDrawer(null)}
          teamId={currentTeamId!}
          projectId={projectId}
          onRestore={() => {
            setActiveDrawer(null);
          }}
        />
      )}

      {contextMenu && (
        <CanvasContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onDeleteNode={canvas.deleteNode}
          onDuplicateNode={canvas.duplicateNode}
          onChangeType={canvas.changeNodeType}
          onAddNode={(type, _x, _y) => {
            const cx = Math.round((400 - canvas.viewport.panX) / canvas.viewport.zoom);
            const cy = Math.round((300 - canvas.viewport.panY) / canvas.viewport.zoom);
            canvas.addNode(type, cx, cy);
          }}
          onDeleteEdge={() => canvas.deleteSelectedEdge()}
          onZoomToNode={canvas.zoomToNode}
          onLinkNode={(id) => setLinkNodeId(id)}
          onSelectAll={canvas.selectAll}
        />
      )}

      {linkNodeId && currentTeamId && projectId && (
        <EntityLinkDialog
          node={canvas.nodes.find((n) => n.id === linkNodeId)!}
          teamId={currentTeamId}
          projectId={projectId}
          onLink={(nodeId, refId, meta) => {
            const node = canvas.nodes.find((n) => n.id === linkNodeId);
            if (node) {
              canvas.updateNode(nodeId, { ref_id: refId || null, meta });
            }
            setLinkNodeId(null);
          }}
          onClose={() => setLinkNodeId(null)}
        />
      )}

      {currentTeamId && (
        <SaveTemplateDialog
          isOpen={showSaveTemplate}
          onClose={() => setShowSaveTemplate(false)}
          teamId={currentTeamId}
          nodes={canvas.nodes}
          edges={canvas.edges}
        />
      )}

      {currentTeamId && projectId && (
        <LoadTemplateDialog
          isOpen={showLoadTemplate}
          onClose={() => setShowLoadTemplate(false)}
          teamId={currentTeamId}
          projectId={projectId}
          onApply={() => {
            canvas.loadCanvas({ nodes: canvas.nodes, edges: canvas.edges, viewport: canvas.viewport });
          }}
        />
      )}
    </div>
  );
}
