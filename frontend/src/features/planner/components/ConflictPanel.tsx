import { AlertTriangle, Loader2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getProjectConflicts, resolveProjectConflicts } from "../api";

interface ConflictPanelProps {
  teamId: string;
  projectId?: string;
  onResolved?: () => void;
}

export function ConflictPanel({ teamId, projectId, onResolved }: ConflictPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  const fetchConflicts = () => {
    setLoading(true);
    getProjectConflicts(teamId, projectId)
      .then(setConflicts)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConflicts();
  }, [teamId, projectId]);

  const handleResolve = async () => {
    if (!projectId || resolving) return;
    setResolving(true);
    try {
      await resolveProjectConflicts(teamId, projectId);
      fetchConflicts();
      onResolved?.();
    } catch (err) {
      console.error("Failed to resolve conflicts:", err);
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

  if (conflicts.length === 0) return null;

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
          onClick={handleResolve}
          disabled={resolving || !projectId}
          className="text-[10px] font-bold uppercase tracking-widest bg-[var(--danger)] text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
        >
          {resolving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Resolving...
            </>
          ) : (
            <>
              <Wand2 className="w-3 h-3" />
              Ask AI to Resolve
            </>
          )}
        </button>
      </div>
    </div>
  );
}
