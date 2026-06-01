"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CanvasNode, CanvasEdge, CanvasViewport } from "../canvasApi";
import { getCanvasLayout, saveCanvasLayout, patchCanvasLayout } from "../canvasApi";

interface UseCanvasSyncOptions {
  teamId: string | null;
  projectId: string | null;
  onLoad: (data: { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: CanvasViewport }) => void;
  sendNodeMove?: (nodeId: string, position: { x: number; y: number }) => void;
}

export function useCanvasSync({ teamId, projectId, onLoad, sendNodeMove }: UseCanvasSyncOptions) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  const load = useCallback(async () => {
    if (!teamId || !projectId) return;
    try {
      const data = await getCanvasLayout(teamId, projectId);
      onLoad({
        nodes: data.nodes || [],
        edges: data.edges || [],
        viewport: data.viewport || { zoom: 0.82, panX: 40, panY: 30 },
      });
    } catch (err) {
      console.error("Failed to load canvas layout:", err);
    }
  }, [teamId, projectId, onLoad]);

  useEffect(() => {
    load();
  }, [load]);

  const debouncedSave = useCallback(
    (nodes: CanvasNode[], edges: CanvasEdge[], viewport: CanvasViewport) => {
      if (!teamId || !projectId) return;

      const key = JSON.stringify({ nodes, edges, viewport });
      if (key === lastSavedRef.current) return;
      lastSavedRef.current = key;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await saveCanvasLayout(teamId, projectId, { nodes, edges, viewport });
        } catch (err) {
          console.error("Failed to save canvas layout:", err);
        }
      }, 800);
    },
    [teamId, projectId],
  );

  const syncNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!teamId || !projectId) return;
      patchCanvasLayout(teamId, projectId, {
        nodes: [{ id: nodeId, x: position.x, y: position.y } as CanvasNode],
      }).catch(console.error);
      sendNodeMove?.(nodeId, position);
    },
    [teamId, projectId, sendNodeMove],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { load, debouncedSave, syncNodeMove };
}
