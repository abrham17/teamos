import { useEffect, useState, useRef, useCallback } from "react";
import { useUser } from "@clerk/clerk-react";

export interface CursorPosition {
  x: number;
  y: number;
  userId: string;
  color: string;
  name: string;
}

const COLORS = ["#f43f5e", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899"];

export function useMultiplayer(
  teamId: string | null,
  projectId: string | null,
  onStateChange?: () => void,
  onNodeMove?: (nodeId: string, position: { x: number; y: number }) => void,
  onChangesetApproved?: (changesetId: string) => void
) {
  const { user } = useUser();
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
  const [connectionKey, setConnectionKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const colorRef = useRef<string>(COLORS[Math.floor(Math.random() * COLORS.length)]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onStateChange, onNodeMove, onChangesetApproved });

  callbacksRef.current = { onStateChange, onNodeMove, onChangesetApproved };

  useEffect(() => {
    if (!teamId || !projectId || !user?.id) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/planning/${teamId}/projects/${projectId}/`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { onStateChange: sc, onNodeMove: nm, onChangesetApproved: oca } = callbacksRef.current;

        if (data.type === "cursor_move") {
          if (data.userId === user?.id) return;
          setCursors((prev) => ({
            ...prev,
            [data.userId]: {
              x: data.x,
              y: data.y,
              userId: data.userId,
              color: data.color,
              name: data.name,
            },
          }));
        } else if (data.type === "node_move") {
          if (data.userId === user?.id) return;
          nm?.(data.nodeId, data.position);
        } else if (data.type === "changeset_approved") {
          oca?.(data.changeset_id || data.changesetId);
        } else if (data.type === "state_change" || data.type === "plan_update") {
          sc?.();
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      reconnectTimeoutRef.current = setTimeout(() => {
        setConnectionKey((k) => k + 1);
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [teamId, projectId, user?.id, connectionKey]);

  const sendCursorMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;

    wsRef.current.send(JSON.stringify({
      type: "cursor_move",
      userId: user?.id,
      x: x,
      y: y,
      color: colorRef.current,
      name: user?.firstName || user?.emailAddresses?.[0]?.emailAddress || "Anonymous",
    }));
  }, [user]);

  const sendNodeMove = useCallback((nodeId: string, position: { x: number; y: number }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "node_move",
      userId: user?.id,
      nodeId: nodeId,
      position: position,
    }));
  }, [user]);

  return { cursors, sendCursorMove, sendNodeMove };
}
