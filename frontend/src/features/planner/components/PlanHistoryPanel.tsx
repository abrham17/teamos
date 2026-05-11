import { useState, useEffect, useCallback } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { listPlanSnapshots, restorePlanSnapshot, createPlanSnapshot } from "../api";
import { PlanSnapshot } from "../types";

interface PlanHistoryPanelProps {
  teamId: string;
  projectId: string;
  onRestore: () => void;
}

export function PlanHistoryPanel({ teamId, projectId, onRestore }: PlanHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<PlanSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchSnapshots = useCallback(() => {
    setLoading(true);
    listPlanSnapshots(teamId, projectId)
      .then(setSnapshots)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId, projectId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const handleRestore = async (snapshotId: string) => {
    if (!confirm("Are you sure you want to restore this snapshot? All current tasks and milestones will be replaced.")) return;
    setRestoring(snapshotId);
    try {
      await restorePlanSnapshot(teamId, projectId, snapshotId);
      onRestore(); // trigger refresh in parent
    } catch (e) {
      console.error(e);
      alert("Failed to restore snapshot.");
    } finally {
      setRestoring(null);
    }
  };

  const handleCreateSnapshot = async () => {
    setLoading(true);
    try {
      await createPlanSnapshot(teamId, projectId, "manual");
      fetchSnapshots();
    } catch (e) {
      console.error(e);
      alert("Failed to create snapshot.");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-950)]/50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-[var(--text-primary)] flex items-center gap-2">
              <History className="w-6 h-6 text-[var(--accent)]" />
              Revision History
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              View and restore previous versions of this project plan.
            </p>
          </div>
          <button
            onClick={handleCreateSnapshot}
            disabled={loading}
            className="px-4 py-2 bg-[var(--surface-2)] text-[var(--text-primary)] rounded-xl text-sm font-bold flex items-center gap-2 border border-[var(--border-subtle)] hover:bg-[var(--surface-3)] transition-all"
          >
            <Save className="w-4 h-4" />
            Create Snapshot
          </button>
        </div>

        {loading && !restoring ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[32px] space-y-4">
            <div className="w-12 h-12 bg-[var(--bg-900)] rounded-2xl flex items-center justify-center mx-auto">
              <History className="w-6 h-6 text-[var(--text-dim)]" />
            </div>
            <p className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-widest">
              No snapshots available
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {snapshots.map((s) => (
              <div key={s.id} className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-6 flex items-center justify-between group hover:border-[var(--accent-subtle)] transition-all">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 rounded-md bg-[var(--accent-subtle)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest border border-[var(--accent)]/20">
                      {s.snapshot_type} Snapshot
                    </span>
                    <span className="text-sm font-bold text-[var(--text-primary)]">
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] font-medium">
                    Created by {s.created_by}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(s.id)}
                  disabled={!!restoring}
                  className="px-4 py-2 bg-[var(--danger)]/10 text-[var(--danger)] rounded-xl text-xs font-bold flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                >
                  {restoring === s.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  Restore Version
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
