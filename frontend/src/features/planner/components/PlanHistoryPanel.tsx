"use client";

import { useState, useEffect, useCallback } from "react";
import { History, Loader2, RotateCcw, CheckCircle, User, Calendar, Layers } from "lucide-react";
import { listApprovedChangeSets, restorePlanVersion } from "../api";
import { PlanChangeSet } from "../types";

interface PlanHistoryPanelProps {
  teamId: string;
  projectId: string;
  onRestore: () => void;
}

export function PlanHistoryPanel({ teamId, projectId, onRestore }: PlanHistoryPanelProps) {
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
    fetchHistory();
  }, [fetchHistory]);

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
      onRestore(); // trigger refresh in parent
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
    const msCount = Number(impact.milestone_count || 0);

    // Estimate updates based on total ops
    const updates = Math.max(0, total - creates - deletes - deps);

    if (creates > 0) parts.push(`created ${creates} item${creates > 1 ? "s" : ""}`);
    if (updates > 0) parts.push(`updated ${updates} item${updates > 1 ? "s" : ""}`);
    if (deletes > 0) parts.push(`deleted ${deletes} item${deletes > 1 ? "s" : ""}`);
    if (deps > 0) parts.push(`reconfigured ${deps} dependency${deps > 1 ? "ies" : ""}`);

    if (parts.length === 0) {
      if (taskCount > 0 || msCount > 0) {
        return `Optimized planning sequence for ${taskCount} task${
          taskCount !== 1 ? "s" : ""
        }`;
      }
      return "Plan optimized with no task/milestone count changes";
    }
    // Capitalize first letter
    const result = parts.join(", ");
    return result.charAt(0).toUpperCase() + result.slice(1);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-950)]/50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-5">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-[var(--text-primary)] flex items-center gap-2.5">
              <History className="w-7 h-7 text-[var(--accent)]" />
              Commit History
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Chronological log of all approved project plan changesets.
            </p>
          </div>
        </div>

        {loading && !restoring ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
        ) : changesets.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[32px] space-y-4 bg-[var(--surface-1)]/30">
            <div className="w-12 h-12 bg-[var(--bg-900)] rounded-2xl flex items-center justify-center mx-auto border border-[var(--border-subtle)]">
              <CheckCircle className="w-6 h-6 text-[var(--text-dim)]" />
            </div>
            <p className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-widest">
              No approved commits in history
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {changesets.map((cs) => {
              const versionToRestore = cs.proposed_version_id || cs.base_version_id;
              return (
                <div
                  key={cs.id}
                  className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 group hover:border-[var(--accent-subtle)] transition-all shadow-sm"
                >
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Approved
                      </span>
                      <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                        {new Date(cs.created_at).toLocaleString()}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                        {cs.created_by || "System"}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[var(--accent)]" />
                        {formatImpactSummary(cs)}
                      </h4>
                      {cs.pending_mutations && cs.pending_mutations.length > 0 && (
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed pl-6">
                          Details:{" "}
                          {cs.pending_mutations
                            .map((m: any, idx) => {
                              const t = m.title || m.fields?.title || m.fields?.name || `Mutation #${idx + 1}`;
                              return `[${m.op}] ${t}`;
                            })
                            .slice(0, 5)
                            .join(", ")}
                          {cs.pending_mutations.length > 5 ? "..." : ""}
                        </p>
                      )}
                    </div>
                  </div>

                  {versionToRestore && (
                    <button
                      onClick={() => handleRestore(versionToRestore)}
                      disabled={!!restoring}
                      className="px-4 py-2 bg-[var(--accent-subtle)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-[var(--accent)]/15 shrink-0 self-start md:self-center"
                    >
                      {restoring === versionToRestore ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      Restore Snapshot
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
