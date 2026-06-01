"use client";

import { useState, useMemo } from "react";
import {
  Target,
  CheckCircle2,
  Flag,
  BookOpen,
  AlertTriangle,
  Layers,
  Briefcase,
  Bookmark,
  GitCommit,
  Zap,
  Loader2,
} from "lucide-react";
import { DrawerContainer } from "./DrawerContainer";
import { ActivityItem } from "../../types";

interface ActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activity: ActivityItem[];
  loading: boolean;
}

type FilterType = "all" | "project" | "task" | "milestone";

const KIND_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; bg: string; border: string; text: string }
> = {
  project: {
    label: "Project",
    icon: Briefcase,
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
  },
  task: {
    label: "Task",
    icon: CheckCircle2,
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
  },
  milestone: {
    label: "Milestone",
    icon: Flag,
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
  },
  wiki: {
    label: "Wiki",
    icon: BookOpen,
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-400",
  },
  conflict: {
    label: "Conflict",
    icon: AlertTriangle,
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-400",
  },
};

function getKindConfig(kind: string) {
  return KIND_CONFIG[kind] ?? KIND_CONFIG["task"];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/10",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/10",
  "in-progress": "bg-blue-500/10 text-blue-400 border-blue-500/10",
  blocked: "bg-rose-500/10 text-rose-400 border-rose-500/10",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/10",
  reached: "bg-emerald-500/10 text-emerald-400 border-emerald-500/10",
  missed: "bg-rose-500/10 text-rose-400 border-rose-500/10",
};

const FILTERS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: "all", label: "All", icon: Layers },
  { key: "project", label: "Projects", icon: Briefcase },
  { key: "task", label: "Tasks", icon: Bookmark },
  { key: "milestone", label: "Milestones", icon: Flag },
];

export function ActivityDrawer({ isOpen, onClose, activity, loading }: ActivityDrawerProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filteredActivity = useMemo(() => {
    if (filter === "all") return activity;
    return activity.filter((item) => item.kind === filter);
  }, [activity, filter]);

  const groupedActivity = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).getTime();

    const groups: Record<string, ActivityItem[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Earlier: [],
    };

    filteredActivity.forEach((item) => {
      try {
        const d = new Date(item.updated_at);
        const ds = d.toDateString();
        if (ds === today) {
          groups["Today"].push(item);
        } else if (ds === yesterday) {
          groups["Yesterday"].push(item);
        } else if (d.getTime() >= weekAgo) {
          groups["This Week"].push(item);
        } else {
          groups["Earlier"].push(item);
        }
      } catch {
        groups["Earlier"].push(item);
      }
    });

    return Object.entries(groups).filter(([, items]) => items.length > 0);
  }, [filteredActivity]);

  if (!isOpen) return null;

  return (
    <DrawerContainer isOpen={isOpen} onClose={onClose} title="Activity Timeline">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
        </div>
      ) : activity.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-[var(--accent)] opacity-40" />
          </div>
          <h4 className="text-base font-bold text-[var(--text-primary)]">No Activity Yet</h4>
          <p className="text-[11px] text-[var(--text-muted)] mt-2 max-w-xs">
            Strategic actions and updates will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter pills */}
          <div className="flex items-center gap-1 bg-[var(--bg-950)] p-1 rounded-lg border border-[var(--border-subtle)] overflow-x-auto scrollbar-hide">
            {FILTERS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 whitespace-nowrap ${
                  filter === key
                    ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Grouped Feed */}
          <div className="space-y-4">
            {groupedActivity.map(([dateGroup, items]) => (
              <div key={dateGroup} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-dim)] bg-[var(--bg-900)] px-2 py-0.5 rounded border border-[var(--border-subtle)]/40">
                    {dateGroup}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]/30" />
                </div>

                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const cfg = getKindConfig(item.kind);
                    const KindIcon = cfg.icon;
                    const userInitials = item.user.split("@")[0].substring(0, 2).toUpperCase();
                    const statusCls = STATUS_COLORS[item.status] ?? "bg-[var(--bg-950)] text-[var(--text-dim)] border-[var(--border-subtle)]";

                    return (
                      <div
                        key={idx}
                        className="flex gap-2 bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:border-[var(--accent-subtle)]/50 p-3 rounded-xl transition-all"
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${cfg.bg} ${cfg.border}`}>
                          <KindIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                {cfg.label}
                              </span>
                              <span className="text-[9px] font-semibold text-[var(--text-dim)]">
                                {new Date(item.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[8px] font-bold text-[var(--text-muted)] bg-[var(--bg-950)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                              <div className="w-3 h-3 rounded bg-[var(--accent-subtle)] text-[var(--accent)] font-black text-[6px] flex items-center justify-center">
                                {userInitials}
                              </div>
                              <span className="truncate max-w-[60px]">{item.user.split("@")[0]}</span>
                            </div>
                          </div>

                          <h4 className="text-[11px] font-bold text-[var(--text-primary)] truncate">
                            {item.title}
                          </h4>

                          <div className="flex items-center justify-between pt-1.5 gap-2">
                            {item.project_name && (
                              <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                                <Target className="w-2.5 h-2.5" />
                                <span className="font-bold truncate">{item.project_name}</span>
                              </div>
                            )}
                            <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${statusCls}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DrawerContainer>
  );
}
