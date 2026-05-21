"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Link2,
  Loader2,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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

interface Props {
  teamId: string;
  sourceId?: string;
  highlightStart?: number;
  highlightEnd?: number;
  onClose?: () => void;
  fullHeight?: boolean;
}

type ViewerMode = "snapshot" | "original" | "browser";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  url: "URL",
  youtube: "YouTube",
  markdown: "Markdown",
  image: "Image",
  repo: "Repository",
  code_zip: "Code zip",
};

function sourceIcon(sourceType: string) {
  if (sourceType === "url") return <Globe className="h-4 w-4" />;
  if (sourceType === "youtube") return <Eye className="h-4 w-4" />;
  if (sourceType === "pdf" || sourceType === "docx" || sourceType === "markdown") return <FileText className="h-4 w-4" />;
  return <Link2 className="h-4 w-4" />;
}

function sourceTitle(source: Pick<RawSourceSummary | RawSourceDetail, "original_filename" | "source_url" | "source_type">) {
  return source.original_filename || source.source_url || `${SOURCE_TYPE_LABELS[source.source_type] || source.source_type} source`;
}

function clampRange(start: number | undefined, end: number | undefined, textLength: number) {
  if (start === undefined || end === undefined || start >= end) return null;
  const safeStart = Math.max(0, Math.min(start, textLength));
  const safeEnd = Math.max(safeStart, Math.min(end, textLength));
  return safeEnd > safeStart ? { start: safeStart, end: safeEnd } : null;
}

function normalizeFileUrl(url: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  try {
    const origin = new URL(apiBase).origin;
    return `${origin}${url}`;
  } catch {
    return url;
  }
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
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
  const [activeHighlight, setActiveHighlight] = useState<{ start?: number; end?: number }>({
    start: highlightStart,
    end: highlightEnd,
  });
  const [viewerMode, setViewerMode] = useState<ViewerMode>("snapshot");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedHighlight, setCopiedHighlight] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const markRef = useRef<HTMLElement>(null);
  const activeHighlightRef = useRef(activeHighlight);

  const highlightRange = useMemo(
    () => clampRange(activeHighlight.start, activeHighlight.end, detail?.extracted_text.length || 0),
    [activeHighlight.end, activeHighlight.start, detail?.extracted_text.length],
  );

  const canShowOriginal = Boolean(detail?.file_url);
  const canShowBrowser = Boolean(detail?.source_url);
  const hasHighlight = Boolean(highlightRange);

  useEffect(() => {
    setSelectedId(sourceId || null);
    setActiveHighlight({ start: highlightStart, end: highlightEnd });
    setDetailError(null);
  }, [highlightEnd, highlightStart, sourceId]);

  useEffect(() => {
    activeHighlightRef.current = activeHighlight;
  }, [activeHighlight]);

  useEffect(() => {
    if (!teamId) return;
    setLoadingList(true);
    setListError(null);
    api
      .get<RawSourceSummary[]>(`/wiki/${teamId}/raw-sources/`)
      .then((data) => {
        setSources(data);
        setSelectedId((current) => current || data[0]?.id || null);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : "Failed to load raw sources."))
      .finally(() => setLoadingList(false));
  }, [teamId]);

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
        const nextDetail = { ...data, file_url: normalizeFileUrl(data.file_url) };
        const currentHighlight = activeHighlightRef.current;
        setDetail(nextDetail);
        setViewerMode(resolveInitialViewerMode(nextDetail, currentHighlight.start, currentHighlight.end));
      })
      .catch((err) => setDetailError(err instanceof Error ? err.message : "Failed to load source detail."))
      .finally(() => setLoadingDetail(false));
  }, [selectedId, teamId]);

  useEffect(() => {
    if (!markRef.current || viewerMode !== "snapshot") return;
    const timer = window.setTimeout(() => {
      markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [detail?.id, highlightRange, viewerMode]);

  const filteredSources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sources;
    return sources.filter((source) => {
      return (
        source.original_filename.toLowerCase().includes(query) ||
        source.source_url.toLowerCase().includes(query) ||
        source.source_type.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, sources]);

  const copyHighlight = () => {
    if (!detail || !highlightRange) return;
    void navigator.clipboard.writeText(detail.extracted_text.slice(highlightRange.start, highlightRange.end));
    setCopiedHighlight(true);
    window.setTimeout(() => setCopiedHighlight(false), 1800);
  };

  const copyFullText = () => {
    if (!detail) return;
    void navigator.clipboard.writeText(detail.extracted_text);
    setCopiedFull(true);
    window.setTimeout(() => setCopiedFull(false), 1800);
  };

  const selectSource = (id: string) => {
    setSelectedId(id);
    if (id !== selectedId) {
      setDetail(null);
      setActiveHighlight({});
    }
  };

  return (
    <div className={`flex bg-[var(--bg-900)] text-[var(--text-primary)] ${fullHeight ? "h-full" : "h-[80vh]"} min-h-[520px] overflow-hidden`}>
      <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-950)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div>
            <h3 className="text-[14px] font-semibold">Sources</h3>
            <p className="text-[11px] text-[var(--text-muted)]">{sources.length} preserved references</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-700)] hover:text-[var(--text-primary)]"
              aria-label="Close source viewer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="border-b border-[var(--border-subtle)] p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search sources"
              className="h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] pl-9 pr-3 text-[12px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/10"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loadingList ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
            </div>
          ) : listError ? (
            <ErrorState message={listError} />
          ) : filteredSources.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12px] text-[var(--text-muted)]">No sources match your search.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredSources.map((source) => {
                const selected = selectedId === source.id;
                return (
                  <button
                    key={source.id}
                    onClick={() => selectSource(source.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${
                      selected
                        ? "border-[var(--accent)]/45 bg-[var(--accent-subtle)] text-[var(--text-primary)]"
                        : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-900)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`${selected ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{sourceIcon(source.source_type)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{sourceTitle(source)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-6 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
                      <span>{SOURCE_TYPE_LABELS[source.source_type] || source.source_type}</span>
                      <span>{source.text_length.toLocaleString()} chars</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="max-h-[36%] shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-900)]">
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)]">
            <FileText className="h-3 w-3" />
            Wiki pages using this source
          </div>
          <div className="max-h-56 overflow-y-auto p-3">
            {!detail ? (
              <p className="text-[12px] text-[var(--text-muted)]">Select a source to see wiki usage.</p>
            ) : detail.citing_pages.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)]">No wiki citations recorded for this source.</p>
            ) : (
              <div className="space-y-1.5">
                {detail.citing_pages.map((citation, index) => {
                  const active =
                    highlightRange?.start === citation.source_char_start &&
                    highlightRange?.end === citation.source_char_end;
                  return (
                    <button
                      key={`${citation.page_id}-${index}`}
                      onClick={() => {
                        setActiveHighlight({
                          start: citation.source_char_start,
                          end: citation.source_char_end,
                        });
                        setViewerMode("snapshot");
                      }}
                      className={`w-full border-l-2 px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-yellow-300 bg-yellow-300/10"
                          : "border-[var(--accent)]/30 hover:bg-[var(--bg-800)]"
                      }`}
                    >
                      <div className="truncate text-[12px] font-medium text-[var(--accent)]">{citation.page_title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)]">
                        {citation.wiki_section && <span>Section: {citation.wiki_section}</span>}
                        {citation.source_page_number !== null && <span>Page {citation.source_page_number}</span>}
                        {citation.source_timestamp && <span>{citation.source_timestamp}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--bg-800)]">
        {loadingDetail && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-900)]/70 backdrop-blur-sm">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {!detail ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--text-dim)]" />
              <p className="text-[14px] font-medium">Select a source</p>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">The document preview will appear here.</p>
              {detailError && <div className="mt-4"><ErrorState message={detailError} /></div>}
            </div>
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-900)] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[var(--accent)]">
                    {sourceIcon(detail.source_type)}
                    <h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{sourceTitle(detail)}</h2>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="rounded-full bg-[var(--accent-subtle)] px-2.5 py-0.5 font-bold uppercase tracking-wide text-[var(--accent)]">
                      {SOURCE_TYPE_LABELS[detail.source_type] || detail.source_type}
                    </span>
                    <span>{detail.extracted_text.length.toLocaleString()} chars</span>
                    <span>{formatDate(detail.created_at)}</span>
                    {hasHighlight && <span className="text-yellow-300">Highlighted citation context</span>}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {detail.source_url && (
                    <a
                      href={detail.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] px-3 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open URL
                    </a>
                  )}
                  {detail.file_url && (
                    <a
                      href={detail.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] px-3 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  )}
                </div>
              </div>
            </header>

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-900)] px-5 py-2.5">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoomLevel((value) => Math.max(70, value - 10))}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-700)] hover:text-[var(--text-primary)]"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-[11px] tabular-nums text-[var(--text-muted)]">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel((value) => Math.min(180, value + 10))}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-700)] hover:text-[var(--text-primary)]"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <ModeButton active={viewerMode === "snapshot"} onClick={() => setViewerMode("snapshot")}>
                  Snapshot
                </ModeButton>
                {canShowOriginal && (
                  <ModeButton active={viewerMode === "original"} onClick={() => setViewerMode("original")}>
                    Original
                  </ModeButton>
                )}
                {canShowBrowser && (
                  <ModeButton active={viewerMode === "browser"} onClick={() => setViewerMode("browser")}>
                    Browser
                  </ModeButton>
                )}
                {hasHighlight && (
                  <button
                    onClick={copyHighlight}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] px-3 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-yellow-300/40 hover:text-yellow-300"
                  >
                    {copiedHighlight ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedHighlight ? "Copied" : "Copy highlight"}
                  </button>
                )}
                <button
                  onClick={copyFullText}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] px-3 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                >
                  {copiedFull ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedFull ? "Copied" : "Copy text"}
                </button>
              </div>
            </div>

            {detailError && (
              <div className="mx-5 mt-4">
                <ErrorState message={detailError} />
              </div>
            )}

            <section className="min-h-0 flex-1 overflow-auto bg-[var(--bg-800)] p-5">
              {viewerMode === "original" ? (
                <OriginalDocument detail={detail} />
              ) : viewerMode === "browser" ? (
                <BrowserDocument detail={detail} onFallback={() => setViewerMode("snapshot")} />
              ) : (
                <SnapshotDocument detail={detail} highlightRange={highlightRange} markRef={markRef} zoomLevel={zoomLevel} />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function resolveInitialViewerMode(detail: RawSourceDetail, start?: number, end?: number): ViewerMode {
  if (start !== undefined && end !== undefined && start < end) return "snapshot";
  if (detail.source_type === "url" && detail.source_url) return "browser";
  if (detail.file_url) return "original";
  return "snapshot";
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--border-subtle)] bg-[var(--bg-800)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-[12px] text-[var(--danger)]">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
}

function OriginalDocument({ detail }: { detail: RawSourceDetail }) {
  if (!detail.file_url) {
    return <MissingPreview message="No original file is available for this source." />;
  }

  return (
    <div className="h-full min-h-[420px] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white">
      {detail.source_type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={detail.file_url} className="h-full w-full object-contain" alt={sourceTitle(detail)} />
      ) : (
        <iframe src={detail.file_url} className="h-full w-full border-0" title={sourceTitle(detail)} />
      )}
    </div>
  );
}

function BrowserDocument({ detail, onFallback }: { detail: RawSourceDetail; onFallback: () => void }) {
  if (!detail.source_url) {
    return <MissingPreview message="No URL is available for this source." />;
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
        <div className="min-w-0 truncate text-[12px]">{detail.source_url}</div>
        <button onClick={onFallback} className="ml-3 rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
          Snapshot fallback
        </button>
      </div>
      <iframe src={detail.source_url} className="min-h-0 flex-1 border-0" title={sourceTitle(detail)} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
    </div>
  );
}

function SnapshotDocument({
  detail,
  highlightRange,
  markRef,
  zoomLevel,
}: {
  detail: RawSourceDetail;
  highlightRange: { start: number; end: number } | null;
  markRef: RefObject<HTMLElement | null>;
  zoomLevel: number;
}) {
  if (!detail.extracted_text.trim()) {
    return <MissingPreview message="This source has no extracted text snapshot yet." />;
  }

  const text = detail.extracted_text;
  const fontSize = 15 * (zoomLevel / 100);

  return (
    <article className="mx-auto min-h-full w-full max-w-4xl rounded-lg bg-white px-12 py-10 text-slate-900 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
      <div className="mb-8 border-b border-slate-200 pb-5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{SOURCE_TYPE_LABELS[detail.source_type] || detail.source_type}</div>
        <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-950">{sourceTitle(detail)}</h1>
        {detail.source_url && <p className="mt-2 break-all text-[12px] text-slate-500">{detail.source_url}</p>}
      </div>
      <div className="raw-source-readable" style={{ fontSize: `${fontSize}px` }}>
        {highlightRange ? (
          <>
            {text.slice(0, highlightRange.start)}
            <mark ref={markRef} className="raw-source-highlight">
              {text.slice(highlightRange.start, highlightRange.end)}
            </mark>
            {text.slice(highlightRange.end)}
          </>
        ) : (
          text
        )}
      </div>
      <style jsx>{`
        .raw-source-readable {
          font-family: Georgia, "Times New Roman", serif;
          line-height: 1.85;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .raw-source-highlight {
          background: rgba(253, 224, 71, 0.72);
          border-bottom: 2px solid #ca8a04;
          border-radius: 3px;
          color: #111827;
          padding: 0.04rem 0.12rem;
        }
      `}</style>
    </article>
  );
}

function MissingPreview({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-900)] p-8 text-center">
      <div>
        <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--text-dim)]" />
        <p className="text-[13px] text-[var(--text-muted)]">{message}</p>
      </div>
    </div>
  );
}
