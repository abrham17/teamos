import { useEffect, useState, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";

export interface CursorPosition {
  x: number;
  y: number;
  userId: string;
  color: string;
  name: string;
}

const COLORS = ["#f43f5e", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899"];

export function useMultiplayer(teamId: string, projectId: string | null, onStateChange?: () => void) {
  const { user } = useAuth();
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const colorRef = useRef<string>(COLORS[Math.floor(Math.random() * COLORS.length)]);

  useEffect(() => {
    if (!teamId || !projectId) return;

    // Build ws url based on current host
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    // In dev, the API is often on 8000
    const wsUrl = `${protocol}//${host}/ws/planning/${teamId}/projects/${projectId}/`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "cursor_move") {
          if (data.userId === user?.id) return; // ignore our own
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
        } else if (data.type === "state_change") {
          onStateChange?.();
        }
      } catch (e) {
        // ignore malformed
      }
    };

    // Cleanup stale cursors
    const interval = setInterval(() => {
      // we would clear cursors here if needed, but keeping it simple for now
    }, 5000);

    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, [teamId, projectId, user?.id, onStateChange]);

  const sendCursorMove = (e: React.MouseEvent | MouseEvent) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    // We send percentage coordinates so it works across different screen sizes
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;

    wsRef.current.send(JSON.stringify({
      type: "cursor_move",
      userId: user?.id,
      x: x,
      y: y,
      color: colorRef.current,
      name: user?.firstName || user?.emailAddresses[0]?.emailAddress || "Anonymous",
    }));
  };

  return { cursors, sendCursorMove };
}
