"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  History,
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
} from "lucide-react";
import { ActivityItem } from "../types";

interface ActivityPanelProps {
  activity: ActivityItem[];
  loading: boolean;
}

type FilterType = "all" | "project" | "task" | "milestone";

const KIND_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; bg: string; border: string; text: string; dot: string }
> = {
  project: {
    label: "Project",
    icon: Briefcase,
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
  },
  task: {
    label: "Task",
    icon: CheckCircle2,
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    dot: "bg-blue-500",
  },
  milestone: {
    label: "Milestone",
    icon: Flag,
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    dot: "bg-amber-500",
  },
  wiki: {
    label: "Wiki",
    icon: BookOpen,
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-400",
    dot: "bg-purple-500",
  },
  conflict: {
    label: "Conflict",
    icon: AlertTriangle,
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-400",
    dot: "bg-rose-500",
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

export function ActivityPanel({ activity, loading }: ActivityPanelProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filteredActivity = useMemo(() => {
    if (filter === "all") return activity;
    return activity.filter((item) => item.kind === filter);
  }, [activity, filter]);

  // Group by date into Today / Yesterday / This Week / Earlier
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

  const FILTERS: { key: FilterType; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Layers },
    { key: "project", label: "Projects", icon: Briefcase },
    { key: "task", label: "Tasks", icon: Bookmark },
    { key: "milestone", label: "Milestones", icon: Flag },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-64">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-[var(--accent-subtle)] border-t-[var(--accent)] rounded-full animate-spin" />
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-b-purple-500 rounded-full animate-ping opacity-30" />
        </div>
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-16 text-center">
        <div className="w-20 h-20 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-3xl flex items-center justify-center mb-5 shadow-inner">
          <Zap className="w-9 h-9 text-[var(--accent)] opacity-40" />
        </div>
        <h4 className="text-lg font-black text-[var(--text-primary)]">No Activity Yet</h4>
        <p className="text-xs text-[var(--text-muted)] mt-2 max-w-xs leading-relaxed">
          Strategic actions, task updates, milestone changes, and wiki syncs will appear here.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 min-w-0 p-8 space-y-8 overflow-y-auto max-w-4xl mx-auto custom-scrollbar"
    >
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-[var(--surface-1)]/30 border border-[var(--border-subtle)] rounded-3xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center border border-[var(--accent)]/10 shadow-sm">
            <GitCommit className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-[var(--text-primary)]">Intelligence Timeline</h2>
            <p className="text-xs text-[var(--text-muted)] font-semibold mt-0.5">
              Chronological log of roadmap adjustments and scope updates.
            </p>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-950)] p-1 rounded-xl border border-[var(--border-subtle)] self-start md:self-auto flex-wrap">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                filter === key
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Grouped Feed */}
      <div className="space-y-8 relative">
        {/* Vertical timeline spine */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--accent-subtle)] via-[var(--border-subtle)] to-transparent pointer-events-none" />

        {groupedActivity.map(([dateGroup, items]) => (
          <div key={dateGroup} className="space-y-3">
            {/* Date group header */}
            <div className="flex items-center gap-3 pl-10">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text-dim)] bg-[var(--bg-900)] px-3 py-1 rounded-full border border-[var(--border-subtle)]/40">
                {dateGroup}
              </span>
              <div className="flex-1 h-px bg-[var(--border-subtle)]/30" />
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const cfg = getKindConfig(item.kind);
                const KindIcon = cfg.icon;
                const userInitials = item.user.split("@")[0].substring(0, 2).toUpperCase();
                const statusCls = STATUS_COLORS[item.status] ?? "bg-[var(--bg-950)] text-[var(--text-dim)] border-[var(--border-subtle)]";

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.035 }}
                    className="flex gap-4 relative"
                  >
                    {/* Timeline dot */}
                    <div className="relative flex-shrink-0 w-10 flex items-center justify-center">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm ${cfg.bg} ${cfg.border} z-10`}>
                        <KindIcon className={`w-4 h-4 ${cfg.text}`} />
                      </div>
                    </div>

                    {/* Card */}
                    <div className="flex-1 group bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:border-[var(--accent-subtle)]/50 p-4 rounded-2xl transition-all shadow-sm hover:shadow-md hover:bg-[var(--surface-2)]/30 min-w-0">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.label}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-[var(--border-strong)] opacity-50" />
                          <span className="text-[10px] font-semibold text-[var(--text-dim)]">
                            {new Date(item.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        {/* User badge */}
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--text-muted)] bg-[var(--bg-950)] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] shadow-sm">
                          <div className="w-4 h-4 rounded-md bg-[var(--accent-subtle)] text-[var(--accent)] font-black text-[7px] flex items-center justify-center">
                            {userInitials}
                          </div>
                          <span className="truncate max-w-[80px]">{item.user.split("@")[0]}</span>
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors mt-2 truncate">
                        {item.title}
                      </h4>

                      <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                        {item.project_name ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-semibold">
                            <Target className="w-3 h-3 text-[var(--text-dim)]" />
                            <span className="font-bold text-[var(--text-secondary)]">{item.project_name}</span>
                          </div>
                        ) : (
                          <div />
                        )}

                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${statusCls}`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
