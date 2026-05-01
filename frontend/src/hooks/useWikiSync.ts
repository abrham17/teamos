"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

type SyncUser = { username?: string };

export function useWikiSync(teamId: string, pageId: string, user: SyncUser | null | undefined) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!teamId || !pageId) return;

    const doc = new Y.Doc();
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/wiki/";
    
    // Room name: team_id:page_id
    const roomName = `${teamId}:${pageId}`;
    const newProvider = new WebsocketProvider(wsUrl, roomName, doc);

    newProvider.awareness.setLocalStateField("user", {
      name: user?.username || "Anonymous",
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
    });

    setYdoc(doc);
    setProvider(newProvider);

    return () => {
      newProvider.destroy();
      doc.destroy();
    };
  }, [teamId, pageId, user]);

  return { ydoc, provider };
}
