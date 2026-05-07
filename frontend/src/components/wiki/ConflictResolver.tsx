"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface Conflict {
  id: string;
  existing_page_id: string;
  existing_page_title: string;
  existing_snippet: string;
  new_snippet: string;
  reason: string;
  confidence: number;
  conflict_block: string;
  resolution: "keep_existing" | "accept_new" | "manual_merge" | null;
  merged_content: string | null;
}

interface ContradictionData {
  changeset_id: string;
  job_id: string;
  conflict_count: number;
  conflicts: Conflict[];
  new_pages: { id: string; title: string }[];
  proposed_content: string;
}

interface Props {
  teamId: string;
  changesetId: string;
  onResolved?: () => void;
  onCancel?: () => void;
}

export default function ConflictResolver({
  teamId,
  changesetId,
  onResolved,
  onCancel,
}: Props) {
  const [data, setData] = useState<ContradictionData | null>(null);
  const [resolutions, setResolutions] = useState<
    Record<string, { resolution: string; merged_content?: string }>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !changesetId) return;
    setLoading(true);
    api
      .get<ContradictionData>(
        `/wiki/${teamId}/contradictions/${changesetId}/`
      )
      .then((d) => {
        setData(d);
        // Initialize resolutions
        const init: Record<string, { resolution: string }> = {};
        d.conflicts.forEach((c) => {
          init[c.id] = { resolution: "accept_new" };
        });
        setResolutions(init);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [teamId, changesetId]);

  const setResolution = (
    conflictId: string,
    resolution: string,
    merged_content?: string
  ) => {
    setResolutions((prev) => ({
      ...prev,
      [conflictId]: { resolution, merged_content },
    }));
  };

  const allResolved =
    data?.conflicts.every((c) => resolutions[c.id]?.resolution) ?? false;

  const handleSubmit = async () => {
    if (!data || !allResolved) return;
    setSubmitting(true);
    setError(null);

    try {
      const payload = data.conflicts.map((c) => ({
        conflict_id: c.id,
        resolution: resolutions[c.id].resolution,
        merged_content: resolutions[c.id].merged_content || null,
      }));

      await api.post(`/wiki/${teamId}/contradictions/${changesetId}/`, {
        resolutions: payload,
      });
      onResolved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit resolutions");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="conflict-resolver-loading">
        <div className="spinner" />
        <p>Analyzing contradictions...</p>
        <style jsx>{`
          .conflict-resolver-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 3rem;
            color: var(--text-secondary, #aaa);
          }
          .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--border-color, #333);
            border-top-color: var(--accent-primary, #6c5ce7);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="conflict-resolver-error">
        <p>⚠️ {error}</p>
        <button onClick={onCancel}>Close</button>
        <style jsx>{`
          .conflict-resolver-error {
            padding: 2rem;
            text-align: center;
            color: var(--text-error, #ff6b6b);
          }
          button {
            margin-top: 1rem;
            background: var(--bg-elevated, #252545);
            border: 1px solid var(--border-color, #333);
            color: var(--text-primary, #e0e0e0);
            padding: 0.5rem 1rem;
            border-radius: 6px;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  if (!data || data.conflicts.length === 0) {
    return (
      <div className="conflict-resolver-empty">
        <p>✅ No contradictions to resolve.</p>
        <button onClick={onCancel}>Close</button>
        <style jsx>{`
          .conflict-resolver-empty {
            padding: 2rem;
            text-align: center;
            color: var(--text-secondary, #aaa);
          }
          button {
            margin-top: 1rem;
            background: var(--accent-primary, #6c5ce7);
            border: none;
            color: #fff;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="conflict-resolver">
      <div className="cr-header">
        <h2>⚠️ Knowledge Conflicts Detected</h2>
        <p className="cr-subtitle">
          {data.conflict_count} contradiction{data.conflict_count !== 1 ? "s" : ""} found.
          Resolve each conflict before the content can be published.
        </p>
      </div>

      <div className="cr-conflicts">
        {data.conflicts.map((conflict, i) => {
          const currentResolution = resolutions[conflict.id]?.resolution;
          return (
            <div key={conflict.id} className="cr-conflict-card">
              <div className="cr-conflict-header">
                <span className="cr-conflict-number">Conflict {i + 1}</span>
                <span className="cr-confidence">
                  {Math.round(conflict.confidence * 100)}% confidence
                </span>
              </div>

              <p className="cr-reason">💡 {conflict.reason}</p>

              <div className="cr-conflict-body">
                {/* Existing content */}
                <div
                  className={`cr-side cr-existing ${
                    currentResolution === "keep_existing" ? "cr-selected" : ""
                  }`}
                >
                  <div className="cr-side-header">
                    <span className="cr-side-label cr-label-existing">
                      ◀ EXISTING
                    </span>
                    <span className="cr-page-title">
                      {conflict.existing_page_title}
                    </span>
                  </div>
                  <pre className="cr-snippet">{conflict.existing_snippet}</pre>
                  <button
                    className={`cr-btn ${
                      currentResolution === "keep_existing" ? "cr-btn-active" : ""
                    }`}
                    onClick={() => setResolution(conflict.id, "keep_existing")}
                  >
                    Keep Existing
                  </button>
                </div>

                {/* Divider */}
                <div className="cr-divider">
                  <span>VS</span>
                </div>

                {/* New content */}
                <div
                  className={`cr-side cr-new ${
                    currentResolution === "accept_new" ? "cr-selected" : ""
                  }`}
                >
                  <div className="cr-side-header">
                    <span className="cr-side-label cr-label-new">
                      NEW ▶
                    </span>
                  </div>
                  <pre className="cr-snippet">{conflict.new_snippet}</pre>
                  <button
                    className={`cr-btn ${
                      currentResolution === "accept_new" ? "cr-btn-active" : ""
                    }`}
                    onClick={() => setResolution(conflict.id, "accept_new")}
                  >
                    Accept New
                  </button>
                </div>
              </div>

              {/* Manual merge option */}
              <div className="cr-merge-option">
                <button
                  className={`cr-btn cr-btn-merge ${
                    currentResolution === "manual_merge" ? "cr-btn-active" : ""
                  }`}
                  onClick={() =>
                    setResolution(
                      conflict.id,
                      "manual_merge",
                      conflict.existing_snippet + "\n\n" + conflict.new_snippet
                    )
                  }
                >
                  ✏️ Edit & Merge
                </button>
                {currentResolution === "manual_merge" && (
                  <textarea
                    className="cr-merge-editor"
                    value={resolutions[conflict.id]?.merged_content || ""}
                    onChange={(e) =>
                      setResolution(
                        conflict.id,
                        "manual_merge",
                        e.target.value
                      )
                    }
                    rows={6}
                    placeholder="Edit the merged content..."
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="cr-error">⚠️ {error}</p>}

      <div className="cr-actions">
        <button className="cr-btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="cr-btn-submit"
          disabled={!allResolved || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Resolving..." : `Resolve ${data.conflict_count} Conflict${data.conflict_count !== 1 ? "s" : ""}`}
        </button>
      </div>

      <style jsx>{`
        .conflict-resolver {
          background: var(--bg-surface, #1a1a2e);
          border-radius: 12px;
          padding: 1.5rem;
          color: var(--text-primary, #e0e0e0);
          max-height: 85vh;
          overflow-y: auto;
        }
        .cr-header h2 {
          margin: 0 0 0.5rem;
          font-size: 1.2rem;
          color: #ff6b6b;
        }
        .cr-subtitle {
          color: var(--text-secondary, #aaa);
          font-size: 0.85rem;
          margin: 0 0 1.5rem;
        }
        .cr-conflict-card {
          background: var(--bg-elevated, #252545);
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1.25rem;
          border: 1px solid var(--border-color, #333);
        }
        .cr-conflict-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .cr-conflict-number {
          font-weight: 600;
          font-size: 0.9rem;
        }
        .cr-confidence {
          font-size: 0.75rem;
          color: var(--text-secondary, #888);
          background: var(--bg-surface, #1a1a2e);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }
        .cr-reason {
          font-size: 0.85rem;
          color: var(--text-secondary, #ccc);
          margin: 0 0 1rem;
          font-style: italic;
        }
        .cr-conflict-body {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 0.75rem;
          align-items: start;
        }
        .cr-side {
          border: 2px solid transparent;
          border-radius: 8px;
          padding: 0.75rem;
          background: var(--bg-surface, #1a1a2e);
          transition: border-color 0.2s;
        }
        .cr-selected {
          border-color: var(--accent-primary, #6c5ce7);
        }
        .cr-side-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .cr-side-label {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.15rem 0.4rem;
          border-radius: 3px;
          letter-spacing: 0.5px;
        }
        .cr-label-existing {
          background: #e74c3c;
          color: #fff;
        }
        .cr-label-new {
          background: #27ae60;
          color: #fff;
        }
        .cr-page-title {
          font-size: 0.8rem;
          color: var(--text-secondary, #aaa);
        }
        .cr-snippet {
          font-size: 0.78rem;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
          background: var(--bg-code, #0d0d1a);
          padding: 0.75rem;
          border-radius: 6px;
          margin: 0 0 0.75rem;
          max-height: 200px;
          overflow-y: auto;
          color: var(--text-primary, #ddd);
        }
        .cr-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 0.25rem;
        }
        .cr-divider span {
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-secondary, #666);
          background: var(--bg-elevated, #252545);
          padding: 0.3rem 0.5rem;
          border-radius: 4px;
        }
        .cr-btn {
          background: var(--bg-elevated, #252545);
          border: 1px solid var(--border-color, #444);
          color: var(--text-primary, #e0e0e0);
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.15s;
          width: 100%;
        }
        .cr-btn:hover {
          border-color: var(--accent-primary, #6c5ce7);
        }
        .cr-btn-active {
          background: var(--accent-primary, #6c5ce7);
          border-color: var(--accent-primary, #6c5ce7);
          color: #fff;
        }
        .cr-merge-option {
          margin-top: 0.75rem;
        }
        .cr-btn-merge {
          width: auto;
        }
        .cr-merge-editor {
          width: 100%;
          margin-top: 0.5rem;
          background: var(--bg-code, #0d0d1a);
          border: 1px solid var(--border-color, #444);
          color: var(--text-primary, #e0e0e0);
          padding: 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-family: monospace;
          resize: vertical;
        }
        .cr-error {
          color: #ff6b6b;
          font-size: 0.85rem;
          margin: 1rem 0;
        }
        .cr-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color, #333);
        }
        .cr-btn-cancel {
          background: transparent;
          border: 1px solid var(--border-color, #444);
          color: var(--text-secondary, #aaa);
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .cr-btn-submit {
          background: var(--accent-primary, #6c5ce7);
          border: none;
          color: #fff;
          padding: 0.5rem 1.25rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .cr-btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .cr-btn-submit:not(:disabled):hover {
          background: #5a4bd1;
        }

        @media (max-width: 768px) {
          .cr-conflict-body {
            grid-template-columns: 1fr;
          }
          .cr-divider {
            padding: 0.5rem 0;
          }
        }
      `}</style>
    </div>
  );
}
