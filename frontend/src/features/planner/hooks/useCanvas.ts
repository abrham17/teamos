"use client";

import { useCallback, useRef, useState } from "react";
import type { CanvasNode, CanvasEdge, CanvasViewport } from "../canvasApi";

export type CanvasNodeType = CanvasNode["type"];

export interface CanvasSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  isDragging: boolean;
  isPanning: boolean;
}

const DEFAULT_VIEWPORT: CanvasViewport = { zoom: 0.82, panX: 40, panY: 30 };
const MAX_UNDO = 30;

export function useCanvas(initialNodes: CanvasNode[] = [], initialEdges: CanvasEdge[] = []) {
  const [state, setState] = useState<CanvasState>({
    nodes: initialNodes,
    edges: initialEdges,
    viewport: DEFAULT_VIEWPORT,
    selectedNodeIds: [],
    selectedEdgeId: null,
    isDragging: false,
    isPanning: false,
  });

  const [undoStack, setUndoStack] = useState<CanvasSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasSnapshot[]>([]);

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectionMousePos, setConnectionMousePos] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; startNodes: {id: string; x: number; y: number}[] } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  const pushUndo = useCallback(() => {
    setState((s) => {
      setUndoStack((prev) => {
        const snapshot: CanvasSnapshot = { nodes: s.nodes, edges: s.edges };
        const next = [...prev, snapshot];
        return next.length > MAX_UNDO ? next.slice(-MAX_UNDO) : next;
      });
      setRedoStack([]);
      return s;
    });
  }, []);

  const undo = useCallback(() => {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setState((s) => {
      setRedoStack((prev) => [...prev, { nodes: s.nodes, edges: s.edges }]);
      return { ...s, nodes: snapshot.nodes, edges: snapshot.edges };
    });
  }, [undoStack]);

  const redo = useCallback(() => {
    const snapshot = redoStack[redoStack.length - 1];
    if (!snapshot) return;
    setRedoStack((prev) => prev.slice(0, -1));
    setState((s) => {
      setUndoStack((prev) => [...prev, { nodes: s.nodes, edges: s.edges }]);
      return { ...s, nodes: snapshot.nodes, edges: snapshot.edges };
    });
  }, [redoStack]);

  const setNodes = useCallback((nodes: CanvasNode[]) => {
    pushUndo();
    setState((s) => ({ ...s, nodes }));
  }, [pushUndo]);

  const setEdges = useCallback((edges: CanvasEdge[]) => {
    pushUndo();
    setState((s) => ({ ...s, edges }));
  }, [pushUndo]);

  const setViewport = useCallback((viewport: CanvasViewport) => {
    setState((s) => ({ ...s, viewport }));
  }, []);

  const selectNode = useCallback((nodeId: string | null, multi: boolean = false) => {
    setState((s) => {
      if (!nodeId) return { ...s, selectedNodeIds: [], selectedEdgeId: null };
      if (multi) {
        const exists = s.selectedNodeIds.includes(nodeId);
        return {
          ...s,
          selectedEdgeId: null,
          selectedNodeIds: exists
            ? s.selectedNodeIds.filter((id) => id !== nodeId)
            : [...s.selectedNodeIds, nodeId],
        };
      }
      return { ...s, selectedNodeIds: [nodeId], selectedEdgeId: null };
    });
  }, []);

  const selectEdge = useCallback((edgeId: string | null) => {
    setState((s) => ({ ...s, selectedEdgeId: edgeId, selectedNodeIds: [] }));
  }, []);

  const selectAll = useCallback(() => {
    setState((s) => ({ ...s, selectedNodeIds: s.nodes.map((n) => n.id), selectedEdgeId: null }));
  }, []);

  const clearSelection = useCallback(() => {
    setState((s) => ({ ...s, selectedNodeIds: [], selectedEdgeId: null }));
  }, []);

  const updateNode = useCallback((nodeId: string, updates: Partial<CanvasNode>) => {
    pushUndo();
    setState((s) => ({
      ...s,
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
    }));
  }, [pushUndo]);

  const updateEdge = useCallback((edgeId: string, updates: Partial<CanvasEdge>) => {
    pushUndo();
    setState((s) => ({
      ...s,
      edges: s.edges.map((e) => (e.id === edgeId ? { ...e, ...updates } : e)),
    }));
  }, [pushUndo]);

  const duplicateNode = useCallback((nodeId: string) => {
    pushUndo();
    setState((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node) return s;
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const dup: CanvasNode = { ...node, id: newId, x: node.x + 40, y: node.y + 40 };
      return { ...s, nodes: [...s.nodes, dup], selectedNodeIds: [newId] };
    });
  }, [pushUndo]);

  const changeNodeType = useCallback((nodeId: string, newType: CanvasNodeType) => {
    pushUndo();
    setState((s) => ({
      ...s,
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, type: newType } : n)),
    }));
  }, [pushUndo]);

  const deleteNode = useCallback((nodeId: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeIds: s.selectedNodeIds.filter((id) => id !== nodeId),
    }));
  }, [pushUndo]);

  const deleteSelectedNodes = useCallback(() => {
    pushUndo();
    setState((s) => {
      const ids = new Set(s.selectedNodeIds);
      return {
        ...s,
        nodes: s.nodes.filter((n) => !ids.has(n.id)),
        edges: s.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
        selectedNodeIds: [],
      };
    });
  }, [pushUndo]);

  const deleteSelectedEdge = useCallback(() => {
    pushUndo();
    setState((s) => ({
      ...s,
      edges: s.edges.filter((e) => e.id !== s.selectedEdgeId),
      selectedEdgeId: null,
    }));
  }, [pushUndo]);

  const groupNodes = useCallback(() => {
    pushUndo();
    setState((s) => {
      const ids = s.selectedNodeIds;
      if (ids.length < 2) return s;
      const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const selectedNodes = s.nodes.filter((n) => ids.includes(n.id));
      if (selectedNodes.length < 2) return s;
      const avgX = Math.round(selectedNodes.reduce((sum, n) => sum + n.x, 0) / selectedNodes.length);
      const avgY = Math.round(selectedNodes.reduce((sum, n) => sum + n.y, 0) / selectedNodes.length);
      const groupNode: CanvasNode = {
        id: groupId,
        type: "task",
        ref_id: null,
        x: avgX - 130,
        y: avgY - 40,
        meta: { name: "Group", group_children: ids, is_group: true },
      };
      return {
        ...s,
        nodes: [...s.nodes, groupNode],
        selectedNodeIds: [groupId],
      };
    });
  }, [pushUndo]);

  const ungroupNodes = useCallback(() => {
    pushUndo();
    setState((s) => {
      let changed = false;
      let remaining = [...s.nodes];
      const newSelected: string[] = [];
      for (const n of s.nodes) {
        if (n.meta?.is_group && s.selectedNodeIds.includes(n.id)) {
          const children = (n.meta as Record<string, unknown>).group_children as string[] | undefined;
          if (children) {
            newSelected.push(...children);
          }
          remaining = remaining.filter((r) => r.id !== n.id);
          changed = true;
        }
      }
      if (!changed) return s;
      return { ...s, nodes: remaining, selectedNodeIds: newSelected };
    });
  }, [pushUndo]);

  const addNode = useCallback((type: CanvasNodeType, x: number, y: number) => {
    pushUndo();
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const node: CanvasNode = { id, type, ref_id: null, x, y, meta: {} };
    setState((s) => ({ ...s, nodes: [...s.nodes, node] }));
    return node;
  }, [pushUndo]);

  const addEdge = useCallback((source: string, target: string) => {
    pushUndo();
    const id = `edge_${source}_${target}`;
    setState((s) => {
      if (s.edges.some((e) => e.source === source && e.target === target)) return s;
      return { ...s, edges: [...s.edges, { id, source, target }] };
    });
  }, [pushUndo]);

  const removeEdge = useCallback((edgeId: string) => {
    pushUndo();
    setState((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== edgeId) }));
  }, [pushUndo]);

  const startDrag = useCallback((nodeId: string, clientX: number, clientY: number) => {
    setState((s) => {
      const selectedSet = s.selectedNodeIds.includes(nodeId) ? new Set(s.selectedNodeIds) : new Set([nodeId]);
      const startNodes = s.nodes
        .filter((n) => selectedSet.has(n.id))
        .map((n) => ({ id: n.id, x: n.x, y: n.y }));
      dragRef.current = { nodeId, startX: clientX, startY: clientY, startNodes };
      return {
        ...s,
        isDragging: true,
        selectedNodeIds: selectedSet.has(nodeId) ? s.selectedNodeIds : [nodeId],
      };
    });
  }, []);

  const onDragMove = useCallback((clientX: number, clientY: number, zoom: number) => {
    if (!dragRef.current) return;
    const dx = (clientX - dragRef.current.startX) / zoom;
    const dy = (clientY - dragRef.current.startY) / zoom;
    const selectedSet = new Set([dragRef.current.nodeId]);
    setState((s) => {
      const multiDrag = s.selectedNodeIds.length > 1 && s.selectedNodeIds.includes(dragRef.current!.nodeId);
      const moveIds = multiDrag ? new Set(s.selectedNodeIds) : selectedSet;
      const startNodes = dragRef.current!.startNodes;
      return {
        ...s,
        nodes: s.nodes.map((n) => {
          if (!moveIds.has(n.id)) return n;
          const start = startNodes.find((sn) => sn.id === n.id);
          if (!start) return n;
          return { ...n, x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) };
        }),
      };
    });
    dragRef.current.startX = clientX;
    dragRef.current.startY = clientY;
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setState((s) => ({ ...s, isDragging: false }));
  }, []);

  const startPan = useCallback((clientX: number, clientY: number) => {
    setState((s) => {
      panRef.current = { startX: clientX, startY: clientY, startPanX: s.viewport.panX, startPanY: s.viewport.panY };
      return { ...s, isPanning: true };
    });
  }, []);

  const onPanMove = useCallback((clientX: number, clientY: number) => {
    if (!panRef.current) return;
    const dx = clientX - panRef.current.startX;
    const dy = clientY - panRef.current.startY;
    setState((s) => ({
      ...s,
      viewport: { ...s.viewport, panX: panRef.current!.startPanX + dx, panY: panRef.current!.startPanY + dy },
    }));
  }, []);

  const endPan = useCallback(() => {
    panRef.current = null;
    setState((s) => ({ ...s, isPanning: false }));
  }, []);

  const zoomIn = useCallback(() => {
    setState((s) => ({ ...s, viewport: { ...s.viewport, zoom: Math.min(2, +(s.viewport.zoom + 0.12).toFixed(2)) } }));
  }, []);

  const zoomOut = useCallback(() => {
    setState((s) => ({ ...s, viewport: { ...s.viewport, zoom: Math.max(0.3, +(s.viewport.zoom - 0.12).toFixed(2)) } }));
  }, []);

  const zoomFit = useCallback(() => {
    setState((s) => ({ ...s, viewport: DEFAULT_VIEWPORT }));
  }, []);

  const zoomToNode = useCallback((nodeId: string) => {
    setState((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node) return s;
      const padding = 300;
      return {
        ...s,
        viewport: {
          zoom: 1,
          panX: -(node.x - padding) * 1,
          panY: -(node.y - padding) * 1,
        },
      };
    });
  }, []);

  const autoLayout = useCallback(() => {
    pushUndo();
    setState((s) => {
      const cols = Math.ceil(Math.sqrt(s.nodes.length));
      const gapX = 340;
      const gapY = 220;
      return {
        ...s,
        nodes: s.nodes.map((n, i) => ({
          ...n,
          x: 60 + (i % cols) * gapX,
          y: 60 + Math.floor(i / cols) * gapY,
        })),
      };
    });
  }, [pushUndo]);

  const loadCanvas = useCallback((data: { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport?: CanvasViewport }) => {
    setState((s) => ({
      ...s,
      nodes: data.nodes,
      edges: data.edges,
      viewport: data.viewport || DEFAULT_VIEWPORT,
    }));
  }, []);

  const startConnect = useCallback((nodeId: string, clientX: number, clientY: number) => {
    setConnectingFrom(nodeId);
    setConnectionMousePos({ x: clientX, y: clientY });
  }, []);

  const updateConnectPos = useCallback((clientX: number, clientY: number, panX: number, panY: number, zoom: number) => {
    setConnectionMousePos({
      x: (clientX - panX) / zoom,
      y: (clientY - panY) / zoom,
    });
  }, []);

  const endConnect = useCallback(
    (targetNodeId: string) => {
      if (connectingFrom && targetNodeId !== connectingFrom) {
        addEdge(connectingFrom, targetNodeId);
      }
      setConnectingFrom(null);
      setConnectionMousePos(null);
    },
    [connectingFrom, addEdge],
  );

  const cancelConnect = useCallback(() => {
    setConnectingFrom(null);
    setConnectionMousePos(null);
  }, []);

  return {
    ...state,
    undoStack,
    redoStack,
    connectingFrom,
    connectionMousePos,
    setNodes,
    setEdges,
    setViewport,
    selectNode,
    selectEdge,
    selectAll,
    clearSelection,
    updateNode,
    updateEdge,
    duplicateNode,
    changeNodeType,
    deleteNode,
    deleteSelectedNodes,
    deleteSelectedEdge,
    addNode,
    addEdge,
    removeEdge,
    groupNodes,
    ungroupNodes,
    startDrag,
    onDragMove,
    endDrag,
    startPan,
    onPanMove,
    endPan,
    zoomIn,
    zoomOut,
    zoomFit,
    zoomToNode,
    autoLayout,
    loadCanvas,
    startConnect,
    updateConnectPos,
    endConnect,
    cancelConnect,
    undo,
    redo,
    dragRef,
    panRef,
  };
}
