"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { Search, Loader2 } from "lucide-react";

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
  fullHeight?: boolean;
}

export default function RawSourceViewer({
  teamId,
  sourceId,
  highlightStart,
  highlightEnd,
  onClose,
  fullHeight,
}: Props) {
  const [sources, setSources] = useState<RawSourceSummary[]>([]);
  const [detail, setDetail] = useState<RawSourceDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(sourceId || null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showRealDoc, setShowRealDoc] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedHighlight, setCopiedHighlight] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const markRef = useRef<HTMLElement>(null);

  // Auto-scroll to highlight
  useEffect(() => {
    if (markRef.current) {
      setTimeout(() => {
        markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100); // slight delay to ensure render
    }
  }, [detail, highlightStart, highlightEnd, showRealDoc]);

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
    setLoadingDetail(true);
    api
      .get<RawSourceDetail>(`/wiki/${teamId}/raw-sources/${selectedId}/`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [selectedId, teamId]);

  const handleCopyHighlight = () => {
    if (highlightStart !== undefined && highlightEnd !== undefined && detail) {
      navigator.clipboard.writeText(detail.extracted_text.slice(highlightStart, highlightEnd));
      setCopiedHighlight(true);
      setTimeout(() => setCopiedHighlight(false), 2000);
    }
  };

  const handleCopyFull = () => {
    if (detail) {
      navigator.clipboard.writeText(detail.extracted_text);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2000);
    }
  };

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return sources;
    const lowerQ = searchQuery.toLowerCase();
    return sources.filter(s => 
      (s.original_filename && s.original_filename.toLowerCase().includes(lowerQ)) || 
      (s.source_url && s.source_url.toLowerCase().includes(lowerQ)) ||
      s.source_type.toLowerCase().includes(lowerQ)
    );
  }, [sources, searchQuery]);

  const renderHighlightedText = (text: string) => {
    if (
      highlightStart === undefined ||
      highlightEnd === undefined ||
      highlightStart >= highlightEnd
    ) {
      return (
        <div className="document-page-container">
          <pre className="raw-source-text" style={{ fontSize: `${14 * (zoomLevel / 100)}px` }}>{text}</pre>
        </div>
      );
    }

    const before = text.slice(0, highlightStart);
    const highlighted = text.slice(highlightStart, highlightEnd);
    const after = text.slice(highlightEnd);

    return (
      <div className="document-page-container">
        <pre className="raw-source-text" style={{ fontSize: `${14 * (zoomLevel / 100)}px` }}>
          {before}
          <mark ref={markRef} className="raw-source-highlight">{highlighted}</mark>
          {after}
        </pre>
      </div>
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
          {detail.file_url && (
            <a
              href={detail.file_url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="raw-source-link font-bold text-white bg-[var(--accent)] px-3 py-1 rounded-md inline-flex items-center gap-2 mt-2"
            >
              ⬇️ Download Original
            </a>
          )}
        </div>

        {detail.citing_pages.length > 0 && (
          <div className="raw-source-citations">
            <h4>📎 Wiki Pages Using This Source</h4>
            <ul>
              {detail.citing_pages.map((c, i) => (
                <li key={i}>
                  <a href={`/wiki?page=${encodeURIComponent(c.page_slug)}`}>
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


        <div className="raw-source-toolbar flex items-center justify-between mb-4 mt-6 p-3 bg-[var(--bg-950)] rounded-lg border border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <button className="toolbar-btn" onClick={() => setZoomLevel(z => Math.max(50, z - 10))}>-</button>
            <span className="text-xs text-[var(--text-muted)] w-12 text-center">{zoomLevel}%</span>
            <button className="toolbar-btn" onClick={() => setZoomLevel(z => Math.min(200, z + 10))}>+</button>
          </div>
          <div className="flex items-center gap-3">
            {(highlightStart !== undefined && highlightEnd !== undefined) && (
              <button 
                className="toolbar-btn text-xs"
                onClick={handleCopyHighlight}
              >
                {copiedHighlight ? "✅ Copied!" : "📋 Copy Highlight"}
              </button>
            )}
            <button 
              className="toolbar-btn text-xs"
              onClick={handleCopyFull}
            >
              {copiedFull ? "✅ Copied!" : "📋 Copy Full Text"}
            </button>
            {detail.file_url && (
              <button 
                className={`toolbar-btn text-xs font-bold ${showRealDoc ? 'bg-[var(--accent)] text-white' : ''}`}
                onClick={() => setShowRealDoc(!showRealDoc)}
              >
                {showRealDoc ? "👀 View Parsed Text" : "🖼️ View Real Document"}
              </button>
            )}
          </div>
        </div>

        {showRealDoc && detail.file_url ? (
          <div 
            className="real-doc-container w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-white"
            style={{ height: fullHeight ? '100%' : '75vh' }}
          >
            {detail.source_type === 'image' ? (
              <img src={detail.file_url} className="w-full h-full object-contain" alt="Original source" />
            ) : (
              <iframe src={detail.file_url} className="w-full h-full border-0" title="Original source" />
            )}
          </div>
        ) : (
          <div className="raw-source-content">
            <h4>Extracted Text</h4>
            {renderHighlightedText(detail.extracted_text)}
          </div>
        )}

        <style jsx>{`
          .raw-source-viewer-detail {
            padding: 1.5rem;
            background: var(--bg-surface, #1a1a2e);
            border-radius: 12px;
            color: var(--text-primary, #e0e0e0);
            max-height: ${fullHeight ? 'none' : '80vh'};
            height: ${fullHeight ? '100%' : 'auto'};
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
          .toolbar-btn {
            background: var(--surface-1);
            border: 1px solid var(--border-subtle);
            color: var(--text-primary);
            padding: 0.3rem 0.6rem;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .toolbar-btn:hover {
            background: var(--surface-2);
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
            margin-top: 1.5rem;
            background: var(--bg-950, #0a0a0a);
            padding: 2rem;
            border-radius: 12px;
            border: 1px solid var(--border-subtle, #333);
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .raw-source-content h4 {
            margin: 0 0 1.5rem;
            font-size: 0.95rem;
            align-self: flex-start;
            color: var(--text-muted, #888);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .document-page-container {
            width: 100%;
            max-width: 850px;
            background: #ffffff;
            color: #111827;
            border-radius: 4px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.2);
            padding: 4rem 5rem;
            margin: 0 auto;
            position: relative;
          }
          :global(.raw-source-text) {
            font-family: 'Merriweather', 'Georgia', serif;
            font-size: 14px;
            line-height: 1.8;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: ${fullHeight ? 'none' : '50vh'};
            overflow-y: auto;
            color: #1f2937;
            margin: 0;
            padding: 0;
            background: transparent;
            /* Style scrollbar for the document */
            scrollbar-width: thin;
            scrollbar-color: #cbd5e1 transparent;
          }
          :global(.raw-source-text::-webkit-scrollbar) {
            width: 6px;
          }
          :global(.raw-source-text::-webkit-scrollbar-thumb) {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
          :global(.raw-source-highlight) {
            background: rgba(253, 224, 71, 0.5); /* Yellow highlighter look */
            color: #000;
            border-bottom: 2px solid #eab308;
            padding: 0.1rem 0;
            font-weight: 500;
            border-radius: 2px;
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

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] w-4 h-4" />
        <input 
          type="text"
          placeholder="Search sources by name or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {sources.length === 0 ? (
        <p className="raw-source-empty">No raw sources yet. Ingest a document to get started.</p>
      ) : filteredSources.length === 0 ? (
        <p className="raw-source-empty">No sources match your search.</p>
      ) : (
        <div className="relative">
          {loadingDetail && (
            <div className="absolute inset-0 bg-[var(--bg-surface)]/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
              <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
            </div>
          )}
          <ul className="raw-source-list">
            {filteredSources.map((s) => (
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
        </div>
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
