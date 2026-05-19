"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { Search, Loader2, ChevronLeft, X, ExternalLink, Download, Copy, Check, ZoomIn, ZoomOut, FileText, Eye } from "lucide-react";

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
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedHighlight, setCopiedHighlight] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedHighlightCheck, setCopiedHighlightCheck] = useState(false);
  const [copiedFullCheck, setCopiedFullCheck] = useState(false);
  const markRef = useRef<HTMLElement>(null);

  const normalizeFileUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    try {
      const origin = new URL(apiBase).origin;
      return `${origin}${url}`;
    } catch {
      return url;
    }
  };

  useEffect(() => {
    setSelectedId(sourceId || null);
    setDetailError(null);
  }, [sourceId]);

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
    setLoadingList(true);
    setListError(null);
    api
      .get<RawSourceSummary[]>(`/wiki/${teamId}/raw-sources/`)
      .then(setSources)
      .catch((err) => setListError(err instanceof Error ? err.message : "Failed to load raw sources."))
      .finally(() => setLoadingList(false));
  }, [teamId]);

  // Fetch detail when selected
  useEffect(() => {
    if (!selectedId || !teamId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setDetailError(null);
    api
      .get<RawSourceDetail>(`/wiki/${teamId}/raw-sources/${selectedId}/`)
      .then((data) => {
        setDetail({ ...data, file_url: normalizeFileUrl(data.file_url) });
      })
      .catch((err) => setDetailError(err instanceof Error ? err.message : "Failed to load source detail."))
      .finally(() => setLoadingDetail(false));
  }, [selectedId, teamId]);

  const handleCopyHighlight = () => {
    if (highlightStart !== undefined && highlightEnd !== undefined && detail) {
      navigator.clipboard.writeText(detail.extracted_text.slice(highlightStart, highlightEnd));
      setCopiedHighlight(true);
      setCopiedHighlightCheck(true);
      setTimeout(() => { setCopiedHighlight(false); setCopiedHighlightCheck(false); }, 2000);
    }
  };

  const handleCopyFull = () => {
    if (detail) {
      navigator.clipboard.writeText(detail.extracted_text);
      setCopiedFull(true);
      setCopiedFullCheck(true);
      setTimeout(() => { setCopiedFull(false); setCopiedFullCheck(false); }, 2000);
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
      <div className={`flex flex-col bg-[var(--bg-800)] text-[var(--text-primary)] ${fullHeight ? 'h-full' : 'max-h-[80vh]'} overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-900)]">
          <button
            onClick={() => { setSelectedId(null); setDetail(null); }}
            className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--bg-700)]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to sources
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-700)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] space-y-3">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] flex items-start gap-2">
            <span className="text-lg leading-none mt-0.5">{SOURCE_TYPE_ICONS[detail.source_type] || "📁"}</span>
            <span className="break-all">{detail.original_filename || detail.source_url || "Raw Source"}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] text-[11px] font-bold uppercase tracking-wide">
              {detail.source_type}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-700)] text-[var(--text-muted)] text-[11px] border border-[var(--border-subtle)]">
              {detail.extracted_text.length.toLocaleString()} chars
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-700)] text-[var(--text-muted)] text-[11px] border border-[var(--border-subtle)]">
              {new Date(detail.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.source_url && (
              <a href={detail.source_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[12px] text-[var(--accent)] hover:underline truncate max-w-xs">
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{detail.source_url}</span>
              </a>
            )}
            {detail.file_url && (
              <a href={detail.file_url} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[12px] px-3 py-1 rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-dark)] transition-colors">
                <Download className="w-3 h-3" /> Download Original
              </a>
            )}
          </div>
        </div>

        {/* Citations */}
        {detail.citing_pages.length > 0 && (
          <div className="px-5 py-3 border-b border-[var(--border-subtle)] space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)] flex items-center gap-1">
              <FileText className="w-3 h-3" />Wiki pages using this source
            </p>
            <div className="space-y-1">
              {detail.citing_pages.map((c, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[12px] pl-2 border-l-2 border-[var(--accent)]/30">
                  <a href={`/wiki?page=${encodeURIComponent(c.page_slug)}`}
                    className="text-[var(--accent)] hover:underline font-medium">
                    {c.page_title}
                  </a>
                  {c.wiki_section && <span className="text-[var(--text-dim)]">§ {c.wiki_section}</span>}
                  {c.source_page_number !== null && <span className="text-[var(--text-dim)]">p.{c.source_page_number}</span>}
                  {c.source_timestamp && <span className="text-[var(--text-dim)]">{c.source_timestamp}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-900)] shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => setZoomLevel(z => Math.max(50, z - 10))}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-all">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="w-12 text-center text-[11px] text-[var(--text-muted)] tabular-nums">{zoomLevel}%</span>
            <button onClick={() => setZoomLevel(z => Math.min(200, z + 10))}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-all">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {highlightStart !== undefined && highlightEnd !== undefined && (
              <button onClick={handleCopyHighlight}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-all">
                {copiedHighlightCheck ? <Check className="w-3 h-3 text-[var(--success)]" /> : <Copy className="w-3 h-3" />}
                {copiedHighlightCheck ? 'Copied!' : 'Copy highlight'}
              </button>
            )}
            <button onClick={handleCopyFull}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-all">
              {copiedFullCheck ? <Check className="w-3 h-3 text-[var(--success)]" /> : <Copy className="w-3 h-3" />}
              {copiedFullCheck ? 'Copied!' : 'Copy full text'}
            </button>
            {detail.file_url && (
              <button onClick={() => setShowRealDoc(!showRealDoc)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-all ${
                  showRealDoc
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}>
                <Eye className="w-3 h-3" />
                {showRealDoc ? 'View parsed text' : 'View real doc'}
              </button>
            )}
          </div>
        </div>

        {/* Document body */}
        <div className="flex-1 overflow-auto p-5">
          {showRealDoc && detail.file_url ? (
            <div className="w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-white"
              style={{ height: fullHeight ? '100%' : '70vh', minHeight: '400px' }}>
              {detail.source_type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.file_url} className="w-full h-full object-contain" alt="Original source" />
              ) : (
                <iframe src={detail.file_url} className="w-full h-full border-0" title="Original source" />
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mb-4">Extracted Text</p>
              {detailError && (
                <div className="mb-3 text-[12px] text-[var(--danger)] px-3 py-2 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/20">
                  {detailError}
                </div>
              )}
              <div className="w-full max-w-[850px] mx-auto bg-white rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden">
                {renderHighlightedText(detail.extracted_text)}
              </div>
            </div>
          )}
        </div>

        <style jsx>{`
          :global(.raw-source-text) {
            font-family: 'Georgia', serif;
            font-size: ${14 * (zoomLevel / 100)}px;
            line-height: 1.8;
            white-space: pre-wrap;
            word-break: break-word;
            color: #1f2937;
            margin: 0;
            padding: 3rem 4rem;
            background: transparent;
          }
          :global(.raw-source-highlight) {
            background: rgba(253, 224, 71, 0.55);
            color: #111827;
            border-bottom: 2px solid #eab308;
            padding: 0.05rem 0.1rem;
            font-weight: 600;
            border-radius: 2px;
          }
        `}</style>
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col bg-[var(--bg-800)] text-[var(--text-primary)] h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-900)] shrink-0">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <span>📚</span> Raw Sources
        </h3>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-700)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-5 py-3 border-b border-[var(--border-subtle)] shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] w-3.5 h-3.5" />
          <input
            type="text"
            placeholder="Search sources by name or type…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl py-2 pl-9 pr-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/10 transition-all"
          />
        </div>
      </div>

      {/* Detail load error */}
      {detailError && selectedId && (
        <div className="mx-5 mt-3 p-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger-bg)] text-[12px] text-[var(--danger)] flex items-center justify-between">
          <span>{detailError}</span>
          <button
            onClick={() => {
              setLoadingDetail(true);
              setDetailError(null);
              api
                .get<RawSourceDetail>(`/wiki/${teamId}/raw-sources/${selectedId}/`)
                .then((data) => setDetail({ ...data, file_url: normalizeFileUrl(data.file_url) }))
                .catch((err) => setDetailError(err instanceof Error ? err.message : "Failed to load source detail."))
                .finally(() => setLoadingDetail(false));
            }}
            className="ml-3 px-2 py-1 rounded-lg border border-[var(--danger)]/40 text-[11px] hover:bg-[var(--danger)]/10 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
          </div>
        ) : listError ? (
          <div className="flex flex-col items-center py-12 gap-3 text-center">
            <p className="text-[13px] text-[var(--text-muted)]">{listError}</p>
            <button
              onClick={() => {
                setListError(null);
                setLoadingList(true);
                api
                  .get<RawSourceSummary[]>(`/wiki/${teamId}/raw-sources/`)
                  .then(setSources)
                  .catch((err) => setListError(err instanceof Error ? err.message : "Failed to load raw sources."))
                  .finally(() => setLoadingList(false));
              }}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-all"
            >
              Retry
            </button>
          </div>
        ) : sources.length === 0 ? (
          <p className="text-center text-[13px] text-[var(--text-muted)] py-12">No raw sources yet. Ingest a document to get started.</p>
        ) : filteredSources.length === 0 ? (
          <p className="text-center text-[13px] text-[var(--text-muted)] py-12">No sources match your search.</p>
        ) : (
          <div className="relative space-y-2">
            {loadingDetail && (
              <div className="absolute inset-0 bg-[var(--bg-800)]/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
                <Loader2 className="w-7 h-7 text-[var(--accent)] animate-spin" />
              </div>
            )}
            {filteredSources.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-900)] hover:bg-[var(--bg-700)] hover:border-[var(--accent)]/30 text-left transition-all group"
              >
                <span className="text-2xl shrink-0">{SOURCE_TYPE_ICONS[s.source_type] || "📁"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                    {s.original_filename || s.source_url || "Raw Source"}
                  </p>
                  <p className="text-[11px] text-[var(--text-dim)] mt-0.5">
                    <span className="text-[var(--accent)] font-semibold">{s.source_type.toUpperCase()}</span>
                    {" · "}{s.text_length.toLocaleString()} chars{" · "}{new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                <ChevronLeft className="w-3.5 h-3.5 text-[var(--text-dim)] rotate-180 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
