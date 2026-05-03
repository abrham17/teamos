"use client";

import { motion } from "motion/react";
import { History, Target, CheckCircle2, Clock, User } from "lucide-react";

interface ActivityPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activity: any[];
  loading: boolean;
}

export function ActivityPanel({ activity, loading }: ActivityPanelProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--accent-subtle)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
        <History className="w-16 h-16 mb-4 text-[var(--text-dim)]" />
        <h4 className="text-lg font-bold text-[var(--text-primary)]">No Activity Found</h4>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Your team&apos;s strategic movements will appear here.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 min-w-0 p-8 space-y-8 overflow-y-auto max-w-4xl mx-auto"
    >
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center">
            <History className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-[var(--text-primary)]">
            Intelligence Timeline
          </h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Real-time tracking of mission updates and roadmap evolution.
        </p>
      </header>

      <div className="relative space-y-4">
        {/* Vertical Line */}
        <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-[var(--accent-subtle)] via-[var(--border-subtle)] to-transparent" />

        {activity.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="relative flex gap-6 group"
          >
            <div
              className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center z-10 shadow-sm border ${
                item.kind === "project"
                  ? "bg-[var(--surface-1)] border-[var(--accent)] text-[var(--accent)]"
                  : "bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-muted)] group-hover:border-[var(--accent-subtle)] transition-colors"
              }`}
            >
              {item.kind === "project" ? (
                <Target className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 pt-1 space-y-1 pb-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                    {item.kind} update
                  </span>
                  <span className="w-1 h-1 rounded-full bg-[var(--text-dim)] opacity-40" />
                  <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase">
                    {new Date(item.updated_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--text-muted)] bg-[var(--bg-900)] px-2 py-1 rounded-lg">
                  <User className="w-3 h-3" />
                  {item.user.split("@")[0]}
                </div>
              </div>

              <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                {item.title}
              </h4>

              {item.project_name && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <span>In</span>
                  <span className="font-bold text-[var(--text-secondary)]">{item.project_name}</span>
                </div>
              )}

              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-dim)] uppercase">
                  <Clock className="w-3 h-3" />
                  {new Date(item.updated_at).toLocaleDateString()}
                </div>
                <div
                  className={`text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded ${
                    item.status === "active" || item.status === "completed"
                      ? "bg-[var(--success-bg)] text-[var(--success)]"
                      : "bg-[var(--bg-900)] text-[var(--text-muted)]"
                  }`}
                >
                  {item.status}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
