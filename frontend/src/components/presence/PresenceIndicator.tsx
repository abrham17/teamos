"use client";

import { usePresence, PresenceUser } from "@/hooks/usePresence";
import { Users } from "lucide-react";

interface Props {
  teamId: string | null;
  currentPageSlug?: string | null;
  isTyping?: boolean;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
    "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#06b6d4", "#3b82f6",
  ];
  return colors[Math.abs(hash) % colors.length];
}

function UserAvatar({ user }: { user: PresenceUser }) {
  const initial = user.email.charAt(0).toUpperCase();
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-[var(--bg-900)] relative"
      style={{ backgroundColor: stringToColor(user.email) }}
      title={`${user.email}${user.is_typing ? " (typing...)" : ""}`}
    >
      {initial}
      {user.is_typing && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-[var(--bg-900)]" />
      )}
    </div>
  );
}

export function PresenceIndicator({ teamId, currentPageSlug, isTyping = false }: Props) {
  const { activeUsers, connected, sendPresence } = usePresence(teamId);

  if (connected && currentPageSlug !== undefined) {
    sendPresence(currentPageSlug ?? null, isTyping);
  }

  if (!connected || activeUsers.length <= 1) return null;

  const others = activeUsers.filter((u) => u.page_slug === currentPageSlug);
  const elsewhere = activeUsers.filter((u) => u.page_slug !== currentPageSlug && u.page_slug);

  return (
    <div className="flex items-center gap-3 text-xs">
      {others.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1.5">
            {others.slice(0, 3).map((u) => (
              <UserAvatar key={u.email} user={u} />
            ))}
          </div>
          <span className="text-[var(--text-muted)]">
            {others.length === 1
              ? `${others[0].email.split("@")[0]} is here`
              : `${others.length} people here`}
          </span>
        </div>
      )}
      {elsewhere.length > 0 && (
        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          <Users className="w-3 h-3" />
          <span>{elsewhere.length} on other pages</span>
        </div>
      )}
    </div>
  );
}
