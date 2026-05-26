import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X, AlertTriangle, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import {
  approveChangeSet,
  getChangeSet,
  listPendingChangeSets,
  rejectChangeSet,
} from "../api";
import { PlanChangeSet } from "../types";

interface PlanReviewPanelProps {
  teamId: string;
  projectId: string;
  onResolved: () => void;
}

const OP_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  create: { label: "Create", color: "text-emerald-400", bgColor: "bg-emerald-600/10" },
  update: { label: "Update", color: "text-amber-400", bgColor: "bg-amber-600/10" },
  delete: { label: "Delete", color: "text-rose-400", bgColor: "bg-rose-600/10" },
  set_dependencies: { label: "Link", color: "text-sky-400", bgColor: "bg-sky-600/10" },
  update_project: { label: "Project", color: "text-violet-400", bgColor: "bg-violet-600/10" },
};

function MutationDiff({ mutation }: { mutation: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const op = String(mutation.op || "update");
  const config = OP_CONFIG[op] || OP_CONFIG.update;
  const title = String(mutation.title || mutation.entity_type || "Entity");
  const fields = (mutation.fields || {}) as Record<string, unknown>;
  const oldFields = (mutation.old_fields || {}) as Record<string, unknown>;
  const hasChanges = Object.keys(fields).length > 0 && Object.keys(oldFields).length > 0;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-1)] transition-colors"
      >
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
        <span className="text-[11px] font-medium text-[var(--text-primary)]">{title}</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-[var(--text-dim)] ml-auto" />
        ) : (
          <ChevronRight className="h-3 w-3 text-[var(--text-dim)] ml-auto" />
        )}
      </button>

      {expanded && hasChanges && (
        <div className="px-3 pb-2 space-y-1 border-t border-[var(--border-subtle)] pt-2">
          {Object.keys(fields).map((key) => {
            const oldVal = oldFields[key];
            const newVal = fields[key];
            const hasChanged = oldVal !== undefined && String(oldVal) !== String(newVal);

            return (
              <div key={key} className="flex items-start gap-2 text-[10px]">
                <span className="text-[var(--text-dim)] w-20 shrink-0 font-mono">{key}</span>
                {hasChanged && (
                  <span className="text-[var(--danger)] line-through">{String(oldVal)}</span>
                )}
                {hasChanged && (
                  <ArrowRight className="h-2.5 w-2.5 text-[var(--text-dim)] shrink-0 mt-0.5" />
                )}
                <span className={hasChanged ? "text-[var(--success)]" : "text-[var(--text-muted)]"}>
                  {String(newVal)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PlanReviewPanelProps {
  teamId: string;
  projectId: string;
  onResolved: () => void;
}

export function PlanReviewPanel({ teamId, projectId, onResolved }: PlanReviewPanelProps) {
  const [changesets, setChangesets] = useState<PlanChangeSet[]>([]);
  const [selected, setSelected] = useState<PlanChangeSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listPendingChangeSets(teamId, projectId)
      .then(setChangesets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      const detail = await getChangeSet(teamId, projectId, id);
      setSelected(detail);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApprove = async (id: string) => {
    setActing(true);
    try {
      await approveChangeSet(teamId, projectId, id);
      setSelected(null);
      load();
      onResolved();
    } catch (e) {
      console.error(e);
      alert("Failed to approve changes.");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async (id: string) => {
    setActing(true);
    try {
      await rejectChangeSet(teamId, projectId, id);
      setSelected(null);
      load();
    } catch (e) {
      console.error(e);
      alert("Failed to reject changes.");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (changesets.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] p-4">No pending AI plan changes to review.</p>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        Pending plan changes
      </h3>
      {changesets.map((cs) => (
        <div
          key={cs.id}
          className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-1)] space-y-3"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {new Date(cs.created_at).toLocaleString()}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {(cs.impact_summary?.pending_approval_count as number) ??
                  cs.pending_mutations?.length ??
                  0}{" "}
                mutations need approval
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openDetail(cs.id)}
                className="text-xs font-bold text-[var(--accent)]"
              >
                Details
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => handleApprove(cs.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 text-xs font-bold flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => handleReject(cs.id)}
                className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 text-xs font-bold flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Reject
              </button>
            </div>
          </div>
        </div>
      ))}

      {selected && (
        <div className="border border-[var(--accent-subtle)] rounded-xl p-4 bg-[var(--bg-900)] space-y-2 max-h-96 overflow-y-auto">
          <p className="text-xs font-black uppercase text-[var(--text-dim)]">Proposed mutations</p>
          {(selected.pending_mutations || selected.mutations || []).map((m, i) => (
            <MutationDiff key={i} mutation={m as Record<string, unknown>} />
          ))}
        </div>
      )}
    </div>
  );
}
