"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

export type WikiChangeSetPayload = {
  id: string;
  proposed_content: string;
  baseline_content?: string;
  diff_summary?: {
    contradictions?: Array<string | {
      reason?: string;
      existing_page_title?: string;
      existing_snippet?: string;
      new_snippet?: string;
      confidence?: number;
    }>;
    additions?: string[];
    related_pages?: string[];
  };
};

type Props = {
  open: boolean;
  teamId: string;
  changeset: WikiChangeSetPayload | null;
  onClose: () => void;
  onApplied: () => void;
};

export function WikiPublishReviewModal({ open, teamId, changeset, onClose, onApplied }: Props) {
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  if (!open || !changeset) return null;

  const contradictions = changeset.diff_summary?.contradictions ?? [];
  const additions = changeset.diff_summary?.additions ?? [];
  const related = changeset.diff_summary?.related_pages ?? [];

  const approve = async () => {
    setBusy("approve");
    try {
      await api.post(`/wiki/${teamId}/changesets/${changeset.id}/approve/`, {});
      success("Changes applied and wiki updated.");
      onApplied();
      onClose();
    } catch {
      toastError("Could not approve changes.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy("reject");
    try {
      await api.post(`/wiki/${teamId}/changesets/${changeset.id}/reject/`, {});
      success("Publish review rejected.");
      onClose();
    } catch {
      toastError("Could not reject changes.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-review-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-2xl"
      >
        <div className="border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 id="wiki-review-title" className="text-lg font-semibold text-[var(--text-primary)]">
            Review publish
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Compare the current page to the proposed body. Approve to apply and re-index, or reject to keep the wiki
            unchanged.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {(related.length > 0 || additions.length > 0) && (
            <div className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] p-3 text-sm">
              {related.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-bold uppercase text-[var(--text-dim)]">Related pages</div>
                  <ul className="mt-1 list-inside list-disc text-[var(--text-secondary)]">
                    {related.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {additions.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase text-[var(--text-dim)]">Suggested additions</div>
                  <ul className="mt-1 list-inside list-disc text-[var(--text-secondary)]">
                    {additions.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {contradictions.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="text-xs font-bold uppercase text-amber-200">Possible contradictions</div>
              <ul className="mt-2 list-inside list-disc text-sm text-amber-100/90">
                {contradictions.map((c, i) => {
                  const text = typeof c === "string"
                    ? c
                    : c.reason || [
                        c.existing_page_title ? `Conflict with ${c.existing_page_title}` : "Possible conflict",
                        c.existing_snippet && c.new_snippet
                          ? `${c.existing_snippet} / ${c.new_snippet}`
                          : "",
                      ].filter(Boolean).join(": ");
                  return <li key={i}>{text}</li>;
                })}
              </ul>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-bold uppercase text-[var(--text-dim)]">Current (baseline)</div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] p-3 text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                {changeset.baseline_content || "(empty)"}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-xs font-bold uppercase text-[var(--text-dim)]">Proposed</div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] p-3 text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                {changeset.proposed_content}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-900)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-800)] disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void reject()}
            disabled={busy !== null}
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => void approve()}
            disabled={busy !== null}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--bg-950)] hover:opacity-90 disabled:opacity-50"
          >
            {busy === "approve" ? "Applying…" : "Approve & apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
