"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { History, Target, CheckCircle2, Clock, User, Filter, Layers, Briefcase, Bookmark } from "lucide-react";
import { ActivityItem } from "../types";

interface ActivityPanelProps {
  activity: ActivityItem[];
  loading: boolean;
}

type FilterType = "all" | "project" | "task";

export function ActivityPanel({ activity, loading }: ActivityPanelProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filteredActivity = useMemo(() => {
    if (filter === "all") return activity;
    return activity.filter(item => item.kind === filter);
  }, [activity, filter]);

  // Group by date
  const groupedActivity = useMemo(() => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const groups: Record<string, ActivityItem[]> = {
      "Today": [],
      "Yesterday": [],
      "Earlier": []
    };

    filteredActivity.forEach(item => {
      try {
        const itemDate = new Date(item.updated_at).toDateString();
        if (itemDate === today) {
          groups["Today"].push(item);
        } else if (itemDate === yesterday) {
          groups["Yesterday"].push(item);
        } else {
          groups["Earlier"].push(item);
        }
      } catch (e) {
        // Skip items with invalid dates
        groups["Earlier"].push(item);
      }
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredActivity]);

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
        <div className="w-16 h-16 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl flex items-center justify-center mb-5 text-[var(--text-dim)] shadow-inner">
          <History className="w-8 h-8 animate-pulse" />
        </div>
        <h4 className="text-lg font-black text-[var(--text-primary)]">No Intelligence Logged</h4>
        <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-xs leading-relaxed uppercase tracking-wider">
          Your team&apos;s strategic actions and timeline updates will populate here.
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
      {/* Header section with glass background */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-[var(--surface-1)]/30 border border-[var(--border-subtle)] rounded-3xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center border border-[var(--accent)]/10 shadow-sm">
            <History className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-[var(--text-primary)]">
              Intelligence Timeline
            </h2>
            <p className="text-xs text-[var(--text-muted)] font-semibold mt-0.5">
              Chronological log of roadmap adjustments and scope updates.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-950)] p-1 rounded-xl border border-[var(--border-subtle)] self-start md:self-auto">
          {(["all", "project", "task"] as FilterType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                filter === t
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t === "all" && <Layers className="w-3.5 h-3.5" />}
              {t === "project" && <Briefcase className="w-3.5 h-3.5" />}
              {t === "task" && <Bookmark className="w-3.5 h-3.5" />}
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* Grouped Chronological Feed */}
      <div className="space-y-8 relative">
        {groupedActivity.map(([dateGroup, items]) => (
          <div key={dateGroup} className="space-y-4">
            {/* Group Header */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text-dim)] bg-[var(--bg-900)] px-3 py-1 rounded-full border border-[var(--border-subtle)]/40">
                {dateGroup}
              </span>
              <div className="flex-1 h-px bg-[var(--border-subtle)]/30" />
            </div>

            <div className="space-y-4 relative">
              {items.map((item, idx) => {
                const isProject = item.kind === "project";
                const userInitials = item.user.split("@")[0].substring(0, 2).toUpperCase();
                
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="group flex gap-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:border-[var(--accent-subtle)]/50 p-4 rounded-2xl transition-all shadow-sm hover:shadow-md hover:bg-[var(--surface-2)]/30"
                  >
                    {/* Icon Badge */}
                    <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
                      isProject
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                    }`}>
                      {isProject ? <Target className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isProject 
                              ? "bg-emerald-500/10 text-emerald-500" 
                              : "bg-blue-500/10 text-blue-500"
                          }`}>
                            {item.kind}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-[var(--border-strong)] opacity-50" />
                          <span className="text-[10px] font-semibold text-[var(--text-dim)]">
                            {new Date(item.updated_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {/* Assignee display initials */}
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--text-muted)] bg-[var(--bg-950)] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] shadow-sm">
                          <div className="w-3.5 h-3.5 rounded-md bg-[var(--accent-subtle)] text-[var(--accent)] font-black text-[7px] flex items-center justify-center">
                            {userInitials}
                          </div>
                          <span className="truncate max-w-[80px]">{item.user.split("@")[0]}</span>
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                        {item.title}
                      </h4>

                      <div className="flex items-center justify-between pt-1.5">
                        {item.project_name ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-semibold">
                            <span>In Project</span>
                            <span className="font-bold text-[var(--text-secondary)]">{item.project_name}</span>
                          </div>
                        ) : <div />}

                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                          item.status === "active" || item.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                            : "bg-[var(--bg-950)] text-[var(--text-dim)] border border-[var(--border-subtle)]"
                        }`}>
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
