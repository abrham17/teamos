"use client";

import { useEffect, useState } from "react";
import { DrawerContainer } from "./DrawerContainer";
import { api } from "@/lib/api";

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string | null;
  onNavigate?: (link: string) => void;
}

export function NotificationDrawer({ isOpen, onClose, teamId, onNavigate }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && teamId) {
      setLoading(true);
      api
        .get<Notification[]>(`/api/planning/${teamId}/notifications/?unread_only=true`)
        .then(setNotifications)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, teamId]);

  const markAllRead = async () => {
    if (!teamId || !notifications.length) return;
    try {
      await api.patch(`/api/planning/${teamId}/notifications/`, {
        ids: notifications.map((n) => n.id),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
    }
  };

  const typeEmoji: Record<string, string> = {
    task_overdue: "🔴",
    task_due_today: "📋",
    task_assigned: "👤",
    task_completed: "✅",
    milestone_missed: "⚠️",
    milestone_approaching: "🎯",
    milestone_reached: "🏁",
    conflict_detected: "⚡",
    integration_synced: "🔗",
    mention: "💬",
  };

  return (
    <DrawerContainer isOpen={isOpen} onClose={onClose} title="Notifications">
      {notifications.length > 0 && (
        <button
          onClick={markAllRead}
          className="mb-3 text-[10px] text-[#8b7ff4] hover:text-[#a99ff7] font-medium"
        >
          Mark all as read
        </button>
      )}

      {loading ? (
        <div className="text-[11px] text-[#62627a]">Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="text-[11px] text-[#62627a]">No unread notifications</div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="bg-[#13131a] rounded-lg p-3 border border-[rgba(255,255,255,0.07)] cursor-pointer hover:bg-[#1a1a23]"
              onClick={() => {
                if (n.link && onNavigate) {
                  onNavigate(n.link);
                  onClose();
                }
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-sm">{typeEmoji[n.notification_type] || "📌"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[#eeeef2]">{n.title}</div>
                  <div className="text-[10px] text-[#a0a0b8] mt-0.5 leading-relaxed">{n.message}</div>
                  <div className="text-[9px] text-[#62627a] mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DrawerContainer>
  );
}
