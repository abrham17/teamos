"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface RawSourceSummary {
  id: string;
  source_type: string;
  original_filename: string;
  source_url: string;
  created_at: string;
  has_file: boolean;
  text_length: number;
  ingest_job_id: string | null;
}

interface Citation {
  page_id: string;
  page_title: string;
  page_slug: string;
  wiki_section: string;
  source_char_start: number;
  source_char_end: number;
  source_page_number: number | null;
  source_timestamp: string;
}

interface RawSourceDetail {
  id: string;
  source_type: string;
  original_filename: string;
  source_url: string;
  extracted_text: string;
  structure_map: Record<string, unknown>;
  has_file: boolean;
  file_url: string | null;
  created_at: string;
  citing_pages: Citation[];
}

const SOURCE_TYPE_ICONS: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  url: "🌐",
  youtube: "🎬",
  markdown: "📋",
  image: "🖼️",
  repo: "📦",
  code_zip: "🗜️",
};

interface Props {
  teamId: string;
  /** When set, show detail view for this source */
  sourceId?: string;
  /** Highlight a specific character range in the raw text */
  highlightStart?: number;
  highlightEnd?: number;
  onClose?: () => void;
}

export default function RawSourceViewer({
  teamId,
  sourceId,
  highlightStart,
  highlightEnd,
  onClose,
}: Props) {
  const [sources, setSources] = useState<RawSourceSummary[]>([]);
  const [detail, setDetail] = useState<RawSourceDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(sourceId || null);

  // Fetch source list
  useEffect(() => {
    if (!teamId) return;
    api
      .get<RawSourceSummary[]>(`/wiki/${teamId}/raw-sources/`)
      .then(setSources)
      .catch(console.error);
  }, [teamId]);

  // Fetch detail when selected
  useEffect(() => {
    if (!selectedId || !teamId) {
      setDetail(null);
      return;
    }
    api
      .get<RawSourceDetail>(`/wiki/${teamId}/raw-sources/${selectedId}/`)
      .then(setDetail)
      .catch(console.error);
  }, [selectedId, teamId]);

  const renderHighlightedText = (text: string) => {
    if (
      highlightStart === undefined ||
      highlightEnd === undefined ||
      highlightStart >= highlightEnd
    ) {
      return <pre className="raw-source-text">{text}</pre>;
    }

    const before = text.slice(0, highlightStart);
    const highlighted = text.slice(highlightStart, highlightEnd);
    const after = text.slice(highlightEnd);

    return (
      <pre className="raw-source-text">
        {before}
        <mark className="raw-source-highlight">{highlighted}</mark>
        {after}
      </pre>
    );
  };

  // Detail view
  if (detail) {
    return (
      <div className="raw-source-viewer-detail">
        <div className="raw-source-header">
          <button
            className="raw-source-back"
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
            }}
          >
            ← Back to sources
          </button>
          {onClose && (
            <button className="raw-source-close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>

        <div className="raw-source-meta">
          <h3>
            {SOURCE_TYPE_ICONS[detail.source_type] || "📁"}{" "}
            {detail.original_filename || detail.source_url || "Raw Source"}
          </h3>
          <div className="raw-source-badges">
            <span className="badge">{detail.source_type.toUpperCase()}</span>
            <span className="badge-muted">
              {detail.extracted_text.length.toLocaleString()} chars
            </span>
            <span className="badge-muted">
              {new Date(detail.created_at).toLocaleDateString()}
            </span>
          </div>
          {detail.source_url && (
            <a
              href={detail.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="raw-source-link"
            >
              🔗 {detail.source_url}
            </a>
          )}
        </div>

        {detail.citing_pages.length > 0 && (
          <div className="raw-source-citations">
            <h4>📎 Wiki Pages Using This Source</h4>
            <ul>
              {detail.citing_pages.map((c, i) => (
                <li key={i}>
                  <a href={`/wiki/${c.page_slug}`}>
                    {c.page_title}
                  </a>
                  {c.wiki_section && (
                    <span className="citation-section"> § {c.wiki_section}</span>
                  )}
                  {c.source_page_number && (
                    <span className="citation-page">
                      {" "}
                      (p. {c.source_page_number})
                    </span>
                  )}
                  {c.source_timestamp && (
                    <span className="citation-timestamp">
                      {" "}
                      ⏱ {c.source_timestamp}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="raw-source-content">
          <h4>Raw Content</h4>
          {renderHighlightedText(detail.extracted_text)}
        </div>

        <style jsx>{`
          .raw-source-viewer-detail {
            padding: 1.5rem;
            background: var(--bg-surface, #1a1a2e);
            border-radius: 12px;
            color: var(--text-primary, #e0e0e0);
            max-height: 80vh;
            overflow-y: auto;
          }
          .raw-source-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }
          .raw-source-back,
          .raw-source-close {
            background: transparent;
            border: 1px solid var(--border-color, #333);
            color: var(--text-secondary, #aaa);
            padding: 0.4rem 0.8rem;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
          }
          .raw-source-back:hover,
          .raw-source-close:hover {
            background: var(--bg-hover, #252545);
          }
          .raw-source-meta h3 {
            margin: 0 0 0.5rem;
            font-size: 1.1rem;
          }
          .raw-source-badges {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
          }
          .badge {
            background: var(--accent-primary, #6c5ce7);
            color: #fff;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
          }
          .badge-muted {
            background: var(--bg-elevated, #252545);
            color: var(--text-secondary, #aaa);
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.7rem;
          }
          .raw-source-link {
            color: var(--accent-primary, #6c5ce7);
            text-decoration: none;
            font-size: 0.85rem;
          }
          .raw-source-link:hover {
            text-decoration: underline;
          }
          .raw-source-citations {
            margin: 1rem 0;
            padding: 1rem;
            background: var(--bg-elevated, #252545);
            border-radius: 8px;
          }
          .raw-source-citations h4 {
            margin: 0 0 0.5rem;
            font-size: 0.95rem;
          }
          .raw-source-citations ul {
            list-style: none;
            padding: 0;
          }
          .raw-source-citations li {
            padding: 0.3rem 0;
            font-size: 0.85rem;
          }
          .raw-source-citations a {
            color: var(--accent-primary, #6c5ce7);
            text-decoration: none;
          }
          .citation-section,
          .citation-page,
          .citation-timestamp {
            color: var(--text-secondary, #888);
            font-size: 0.8rem;
          }
          .raw-source-content {
            margin-top: 1rem;
          }
          .raw-source-content h4 {
            margin: 0 0 0.5rem;
            font-size: 0.95rem;
          }
          :global(.raw-source-text) {
            background: var(--bg-code, #0d0d1a);
            padding: 1rem;
            border-radius: 8px;
            font-size: 0.8rem;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 50vh;
            overflow-y: auto;
            color: var(--text-primary, #ccc);
          }
          :global(.raw-source-highlight) {
            background: rgba(108, 92, 231, 0.3);
            border-bottom: 2px solid var(--accent-primary, #6c5ce7);
            padding: 0.1rem 0;
          }
        `}</style>
      </div>
    );
  }

  // List view
  return (
    <div className="raw-source-viewer-list">
      <div className="raw-source-header">
        <h3>📚 Raw Sources</h3>
        {onClose && (
          <button className="raw-source-close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <p className="raw-source-empty">No raw sources yet. Ingest a document to get started.</p>
      ) : (
        <ul className="raw-source-list">
          {sources.map((s) => (
            <li key={s.id} onClick={() => setSelectedId(s.id)}>
              <span className="raw-source-icon">
                {SOURCE_TYPE_ICONS[s.source_type] || "📁"}
              </span>
              <div className="raw-source-info">
                <span className="raw-source-name">
                  {s.original_filename || s.source_url || "Raw Source"}
                </span>
                <span className="raw-source-detail-text">
                  {s.source_type.toUpperCase()} · {s.text_length.toLocaleString()} chars ·{" "}
                  {new Date(s.created_at).toLocaleDateString()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .raw-source-viewer-list {
          padding: 1.5rem;
          background: var(--bg-surface, #1a1a2e);
          border-radius: 12px;
          color: var(--text-primary, #e0e0e0);
        }
        .raw-source-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .raw-source-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }
        .raw-source-close {
          background: transparent;
          border: 1px solid var(--border-color, #333);
          color: var(--text-secondary, #aaa);
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          cursor: pointer;
        }
        .raw-source-empty {
          color: var(--text-secondary, #888);
          text-align: center;
          padding: 2rem;
        }
        .raw-source-list {
          list-style: none;
          padding: 0;
        }
        .raw-source-list li {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .raw-source-list li:hover {
          background: var(--bg-hover, #252545);
        }
        .raw-source-icon {
          font-size: 1.5rem;
        }
        .raw-source-info {
          display: flex;
          flex-direction: column;
        }
        .raw-source-name {
          font-size: 0.9rem;
          font-weight: 500;
        }
        .raw-source-detail-text {
          font-size: 0.75rem;
          color: var(--text-secondary, #888);
        }
      `}</style>
    </div>
  );
}
