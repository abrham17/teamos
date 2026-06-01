"use client";

import { useState, useEffect, useCallback } from "react";
import { History, Loader2, RotateCcw, CheckCircle, User, Calendar, Layers } from "lucide-react";
import { DrawerContainer } from "./DrawerContainer";
import { listApprovedChangeSets, restorePlanVersion } from "../../api";
import { PlanChangeSet } from "../../types";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  projectId: string;
  onRestore: () => void;
}

export function HistoryDrawer({ isOpen, onClose, teamId, projectId, onRestore }: HistoryDrawerProps) {
  const [changesets, setChangesets] = useState<PlanChangeSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    listApprovedChangeSets(teamId, projectId)
      .then(setChangesets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId, projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  const handleRestore = async (versionId: string) => {
    if (
      !confirm(
        "Are you sure you want to restore the project state to this version? All current tasks and milestones will be replaced."
      )
    ) {
      return;
    }
    setRestoring(versionId);
    try {
      await restorePlanVersion(teamId, projectId, versionId);
      onRestore();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to restore snapshot.");
    } finally {
      setRestoring(null);
    }
  };

  const formatImpactSummary = (cs: PlanChangeSet) => {
    const impact = cs.impact_summary || {};
    const parts: string[] = [];

    const total = Number(impact.total_ops || 0);
    const creates = Number(impact.create_ops || 0);
    const deletes = Number(impact.destructive_ops || 0);
    const deps = Number(impact.dependency_changes || 0);
    const taskCount = Number(impact.task_count || 0);

    const updates = Math.max(0, total - creates - deletes - deps);

    if (creates > 0) parts.push(`+${creates}`);
    if (updates > 0) parts.push(`~${updates}`);
    if (deletes > 0) parts.push(`-${deletes}`);
    if (deps > 0) parts.push(`${deps} deps`);

    if (parts.length === 0) {
      if (taskCount > 0) {
        return `${taskCount} task${taskCount !== 1 ? "s" : ""}`;
      }
      return "Optimized";
    }
    return parts.join(" ");
  };

  if (!isOpen) return null;

  return (
    <DrawerContainer isOpen={isOpen} onClose={onClose} title="Commit History">
      {loading && !restoring ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
        </div>
      ) : changesets.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-xl space-y-3 bg-[var(--surface-1)]/30">
          <div className="w-10 h-10 bg-[var(--bg-900)] rounded-xl flex items-center justify-center mx-auto border border-[var(--border-subtle)]">
            <CheckCircle className="w-5 h-5 text-[var(--text-dim)]" />
          </div>
          <p className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider">
            No approved commits yet
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {changesets.map((cs) => {
            const versionToRestore = cs.proposed_version_id || cs.base_version_id;
            return (
              <div
                key={cs.id}
                className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-3 hover:border-[var(--accent-subtle)] transition-all"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-wider border border-emerald-500/20 flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" /> Approved
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)] flex items-center gap-0.5">
                      <Calendar className="w-2.5 h-2.5 text-[var(--text-dim)]" />
                      {new Date(cs.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)] flex items-center gap-0.5">
                      <User className="w-2.5 h-2.5 text-[var(--text-dim)]" />
                      {cs.created_by || "System"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-[var(--accent)]" />
                      {formatImpactSummary(cs)}
                    </h4>
                    {cs.pending_mutations && cs.pending_mutations.length > 0 && (
                      <p className="text-[9px] text-[var(--text-muted)] leading-relaxed pl-4 line-clamp-2">
                        {cs.pending_mutations
                          .map((m: { op?: string; title?: string; fields?: { title?: string; name?: string } }, idx) => {
                            const t = m.title || m.fields?.title || m.fields?.name || `#${idx + 1}`;
                            return `[${m.op}] ${t}`;
                          })
                          .slice(0, 3)
                          .join(", ")}
                        {cs.pending_mutations.length > 3 ? "..." : ""}
                      </p>
                    )}
                  </div>

                  {versionToRestore && (
                    <button
                      onClick={() => handleRestore(versionToRestore)}
                      disabled={!!restoring}
                      className="w-full px-3 py-1.5 bg-[var(--accent-subtle)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 border border-[var(--accent)]/15"
                    >
                      {restoring === versionToRestore ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      Restore
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DrawerContainer>
  );
}
