"use client";

import { useEffect, useState } from "react";
import type { IntegrationAction } from "../../canvasApi";

interface IntegrationActionToastProps {
  actions: IntegrationAction[];
  onDismiss: (id: string) => void;
}

const ACTION_ICONS: Record<string, string> = {
  calendar_create: "📅",
  calendar_update: "📅",
  calendar_delete: "🗑️",
  slack_notify: "💬",
  github_create_issue: "🐙",
  github_update_issue: "🐙",
  jira_create_issue: "📋",
  jira_update_issue: "📋",
  linear_create_issue: "⬡",
  linear_update_issue: "⬡",
  email_digest: "📧",
};

const ACTION_LABELS: Record<string, string> = {
  calendar_create: "Calendar event created",
  calendar_update: "Calendar event updated",
  calendar_delete: "Calendar event removed",
  slack_notify: "Slack notification sent",
  github_create_issue: "GitHub issue created",
  github_update_issue: "GitHub issue updated",
  jira_create_issue: "Jira issue created",
  jira_update_issue: "Jira issue updated",
  linear_create_issue: "Linear issue created",
  linear_update_issue: "Linear issue updated",
  email_digest: "Daily digest sent",
};

export function IntegrationActionToast({ actions, onDismiss }: IntegrationActionToastProps) {
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {actions.map((action) => (
        <ActionToastItem key={action.id} action={action} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ActionToastItem({ action, onDismiss }: { action: IntegrationAction; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(action.id), 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [action.id, onDismiss]);

  const icon = ACTION_ICONS[action.action] || "🔗";
  const label = ACTION_LABELS[action.action] || action.action;
  const isSuccess = action.status === "success";
  const isError = action.status === "failed";

  return (
    <div
      className={`rounded-lg px-3 py-2.5 border shadow-lg flex items-center gap-2.5 transition-all duration-300 ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
      }`}
      style={{
        background: isError ? "rgba(248,113,113,0.12)" : "rgba(13,13,18,0.95)",
        borderColor: isError
          ? "rgba(248,113,113,0.3)"
          : isSuccess
            ? "rgba(52,211,153,0.2)"
            : "rgba(255,255,255,0.07)",
      }}
    >
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-[#eeeef2]">{label}</div>
        <div className="text-[9px] text-[#a0a0b8]">
          {isSuccess && "Synced"}
          {isError && (action.error_message || "Failed")}
          {!isSuccess && !isError && action.status}
        </div>
      </div>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(action.id), 300);
        }}
        className="text-[#62627a] hover:text-[#a0a0b8] bg-transparent border-none p-0.5 cursor-pointer"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
