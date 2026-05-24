import { AlertTriangle, Loader2, AlertCircle, CheckCircle2, Sparkles, Calendar, User, Clock, Flag } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { getProjectConflicts, resolveProjectConflicts } from "../api";
import type { PlanConflict } from "../types";
import { useToast } from "@/components/ui/Toast";

interface ConflictPanelProps {
  teamId: string;
  projectId?: string;
  refreshKey?: string;
  onResolved?: () => void;
}

export function ConflictPanel({ teamId, projectId, refreshKey, onResolved }: ConflictPanelProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [conflicts, setConflicts] = useState<PlanConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadConflicts = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    getProjectConflicts(teamId, projectId)
      .then((data) => {
        const order = { high: 0, medium: 1, low: 2 } as const;
        const sorted = [...data].sort((a, b) => order[a.severity] - order[b.severity]);
        setConflicts(sorted);
      })
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : "Failed to load conflicts."))
      .finally(() => setLoading(false));
  }, [teamId, projectId]);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts, refreshKey]);

  const handleResolve = async () => {
    if (!projectId) return;
    setResolving(true);
    try {
      const result = await resolveProjectConflicts(teamId, projectId);
      toastSuccess(
        `Resolved ${result.resolved_count} conflict updates (${result.remaining_conflicts} remaining).`,
      );
      onResolved?.();
      loadConflicts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "AI conflict resolution failed.");
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-[var(--bg-900)]/20 border border-[var(--border-subtle)] rounded-2xl">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Analyzing Schedule...</span>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="bg-[var(--danger-bg)]/20 border border-[var(--danger)]/30 rounded-2xl p-6 mt-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5" />
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-[var(--text-primary)]">Conflict Analysis Interrupted</h4>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">{errorMsg}</p>
            <button
              onClick={loadConflicts}
              className="text-[10px] font-black uppercase tracking-widest bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] px-4 py-2 rounded-xl border border-[var(--border-subtle)] transition-all"
            >
              Retry Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-5 mt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-emerald-400">All Clear!</h4>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">No scheduling conflicts or timeline clashes detected in this project.</p>
          </div>
        </div>
        <span className="hidden sm:inline px-3 py-1 bg-emerald-500/10 border border-emerald-500/10 rounded-full text-[10px] font-black uppercase tracking-wider text-emerald-400">
          Optimal
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--danger)]/15 bg-[var(--danger-bg)]/5 p-6 mt-6 space-y-5 animate-in fade-in duration-300">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-[var(--danger)]/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--danger)]/10 flex items-center justify-center border border-[var(--danger)]/20 text-[var(--danger)] animate-pulse">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)] tracking-tight">
              {conflicts.length} Schedule Conflict{conflicts.length > 1 ? "s" : ""} Detected
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Overlapping dates or double-bookings require resolution.</p>
          </div>
        </div>

        <button
          disabled={!projectId || resolving}
          onClick={() => void handleResolve()}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-wider hover:bg-rose-600 transition-all hover:shadow-[0_0_12px_rgba(244,63,94,0.3)] disabled:opacity-50 active:scale-95 shrink-0"
        >
          {resolving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Resolving Schedule...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Resolve with AI Planner</span>
            </>
          )}
        </button>
      </div>

      {/* Conflict Lists Overlay */}
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {conflicts.map((c, i) => (
          <li 
            key={i} 
            className="rounded-xl border border-[var(--danger)]/10 bg-[var(--bg-950)]/50 p-4 space-y-4 hover:border-[var(--danger)]/25 hover:bg-[var(--bg-950)]/70 transition-all flex flex-col justify-between"
          >
            {/* Conflict Card Title & Chip */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-primary)] flex items-center gap-1.5">
                {c.type === "task_overlap" ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-rose-400" />
                    Task Overlap
                  </>
                ) : (
                  <>
                    <Flag className="w-3.5 h-3.5 text-amber-500" />
                    Milestone Clash
                  </>
                )}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                c.severity === "high"
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/10"
                  : c.severity === "medium"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/10"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/10"
              }`}>
                {c.severity} priority
              </span>
            </div>

            {/* Overlapping Blocks View */}
            <div className="space-y-2.5">
              {c.type === "task_overlap" && (
                <div className="space-y-2">
                  {/* Task 1 Card */}
                  <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-white/[0.03] space-y-1">
                    <div className="text-xs font-bold text-[var(--text-secondary)] truncate">{c.task_1.title}</div>
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-semibold">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{c.task_1.start} to {c.task_1.end}</span>
                    </div>
                  </div>
                  {/* Task 2 Card */}
                  <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-white/[0.03] space-y-1">
                    <div className="text-xs font-bold text-[var(--text-secondary)] truncate">{c.task_2.title}</div>
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-semibold">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{c.task_2.start} to {c.task_2.end}</span>
                    </div>
                  </div>

                  {/* Same Assignee Alert Card */}
                  {c.same_assignee && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400 mt-2">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-wider truncate">
                        Double Booked: {c.task_1.assignee}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {c.type === "milestone_clash" && (
                <div className="space-y-2">
                  {/* Milestone 1 Card */}
                  <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-white/[0.03] space-y-1">
                    <div className="text-xs font-bold text-[var(--text-secondary)] truncate">{c.milestone_1.title}</div>
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-semibold">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>Target date: {c.milestone_1.date}</span>
                    </div>
                  </div>
                  {/* Milestone 2 Card */}
                  <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-white/[0.03] space-y-1">
                    <div className="text-xs font-bold text-[var(--text-secondary)] truncate">{c.milestone_2.title}</div>
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-semibold">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>Target date: {c.milestone_2.date}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Micro details */}
            <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider pt-2 border-t border-white/[0.02] text-right mt-1">
              AI manageable conflict
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
