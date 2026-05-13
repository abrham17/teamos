"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface PresenceUser {
  email: string;
  page_slug: string | null;
  is_typing: boolean;
  last_seen: string;
}

interface PresenceState {
  [email: string]: PresenceUser;
}

interface PresenceMessage {
  type: "presence_sync";
  presence: PresenceState;
}

function getWsBase(): string {
  if (typeof window === "undefined") return "ws://localhost:8000";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return apiUrl.replace(/^http/, "ws");
}

export function usePresence(teamId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [presence, setPresence] = useState<PresenceState>({});
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!teamId || wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsBase = getWsBase();
    const url = `${wsBase}/ws/presence/${teamId}/`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: PresenceMessage = JSON.parse(event.data);
        if (msg.type === "presence_sync") {
          setPresence(msg.presence || {});
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [teamId]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const sendPresence = useCallback(
    (pageSlug: string | null, isTyping: boolean = false) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ page_slug: pageSlug, is_typing: isTyping })
        );
      }
    },
    []
  );

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const activeUsers = Object.values(presence).filter(
    (u) => u.email && u.last_seen
  );

  return { presence, activeUsers, connected, sendPresence, connect, disconnect };
}
