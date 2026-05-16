import { AlertTriangle, Loader2 } from "lucide-react";
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
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-xl p-4 mt-6">
        <p className="text-xs text-[var(--danger)] mb-3">{errorMsg}</p>
        <button
          onClick={loadConflicts}
          className="text-[10px] font-bold uppercase tracking-widest bg-[var(--surface-1)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="bg-[var(--success-bg)] border border-[var(--success)]/20 rounded-xl p-4 mt-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--success)]">
          No active scheduling conflicts detected.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-xl p-4 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--danger)]">
          {conflicts.length} Scheduling Conflict{conflicts.length > 1 ? "s" : ""} Detected
        </h3>
      </div>
      <ul className="space-y-3">
        {conflicts.map((c, i) => (
          <li key={i} className="text-xs text-[var(--danger)]/80 flex flex-col gap-1 bg-[var(--bg-950)]/50 p-3 rounded-lg border border-[var(--danger)]/10">
            <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--warning)]">
              Severity: {c.severity}
            </span>
            {c.type === "task_overlap" && (
              <>
                <span className="font-bold">Overlapping Tasks</span>
                <span>• {c.task_1.title} ({c.task_1.start} to {c.task_1.end})</span>
                <span>• {c.task_2.title} ({c.task_2.start} to {c.task_2.end})</span>
                {c.same_assignee && (
                  <span className="text-[var(--danger)] font-bold mt-1">
                    ⚠ Both assigned to {c.task_1.assignee}
                  </span>
                )}
              </>
            )}
            {c.type === "milestone_clash" && (
              <>
                <span className="font-bold">Milestone Clash</span>
                <span>• {c.milestone_1.title} on {c.milestone_1.date}</span>
                <span>• {c.milestone_2.title} on {c.milestone_2.date}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <button
          disabled={!projectId || resolving}
          onClick={() => void handleResolve()}
          className="text-[10px] font-bold uppercase tracking-widest bg-[var(--danger)] text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {resolving ? "Resolving..." : "Ask AI to Resolve"}
        </button>
      </div>
    </div>
  );
}
