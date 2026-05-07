"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { ChevronLeft, FolderOpen, Book } from "lucide-react";
import { GoogleDocsEditor, type GoogleDocsEditorHandle } from "../editor/GoogleDocsEditor";
import { OpenMarkdown } from "@/components/wiki-open/OpenMarkdown";
import FrontmatterPanel from "@/components/wiki/FrontmatterPanel";
import { useToast } from "@/components/ui/Toast";
import { WikiPublishReviewModal, type WikiChangeSetPayload } from "@/components/wiki-v2/WikiPublishReviewModal";
import RawSourceViewer from "@/components/wiki/RawSourceViewer";

interface Citation {
  id: string;
  raw_source_id: string;
  source_type: string;
  original_filename: string;
  wiki_section: string;
  source_page_number: number | null;
  source_timestamp: string;
}

interface WikiPageDetail {
  id: string;
  title: string;
  slug: string;
  content: string;
  frontmatter?: Record<string, string>;
  citations?: Citation[];
}

export function MarkdownWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTeamId, wikiSidebarOpen, setWikiSidebarOpen } = useWikiStore();
  const { error: toastError, success: toastSuccess } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [page, setPage] = useState<WikiPageDetail | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [frontmatter, setFrontmatter] = useState<Record<string, string>>({});
  const [isNew, setIsNew] = useState(false);
  const editorRef = useRef<GoogleDocsEditorHandle>(null);
  const [autoApproveWiki, setAutoApproveWiki] = useState(true);
  const [publishBusy, setPublishBusy] = useState(false);
  const [reviewChangeset, setReviewChangeset] = useState<WikiChangeSetPayload | null>(null);
  const [showCitations, setShowCitations] = useState(false);
  const [viewingRawSourceId, setViewingRawSourceId] = useState<string | null>(null);

  const slug = searchParams.get("page");
  const action = searchParams.get("action");
  const citationSnippet = searchParams.get("snippet");
  const citationChunk = searchParams.get("chunk");
  const citationAnchorHint = searchParams.get("anchor_hint");
  const citationSource = searchParams.get("source");

  useEffect(() => {
    if (!currentTeamId) return;

    if (action === "new") {
      setIsNew(true);
      setPage(null);
      setTitle("");
      setContent("");
      setFrontmatter({});
      setSaveStatus("idle");
      return;
    }

    if (slug) {
      setIsNew(false);
      setLoading(true);
      setSaveStatus("idle");
      api.get<WikiPageDetail>(`/wiki/${currentTeamId}/pages/${slug}/`)
      .then((data) => {
          setPage(data);
          setTitle(data.title);
          setContent(data.content);
          setFrontmatter((data.frontmatter || {}) as Record<string, string>);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setPage(null);
      setIsNew(false);
      setFrontmatter({});
      setSaveStatus("idle");
    }
  }, [currentTeamId, slug, action]);

  useEffect(() => {
    if (!currentTeamId) return;
    try {
      const v = localStorage.getItem(`teamos-wiki-auto-approve-${currentTeamId}`);
      if (v === "0" || v === "false") setAutoApproveWiki(false);
      else if (v === "1" || v === "true") setAutoApproveWiki(true);
    } catch {
      /* ignore */
    }
  }, [currentTeamId]);

  const persistWikiAutoApprove = (next: boolean) => {
    setAutoApproveWiki(next);
    if (!currentTeamId) return;
    try {
      localStorage.setItem(`teamos-wiki-auto-approve-${currentTeamId}`, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const handlePublish = async () => {
    if (!currentTeamId || !page?.slug) return;
    setPublishBusy(true);
    try {
      const data = await api.post<{
        mode: string;
        changeset?: WikiChangeSetPayload | null;
        job?: unknown;
      }>(`/wiki/${currentTeamId}/pages/${page.slug}/publish/`, { auto_approve: autoApproveWiki });
      if (data.mode === "review_required" && data.changeset) {
        setReviewChangeset(data.changeset);
      } else {
        toastSuccess("Publish completed.");
        const refreshed = await api.get<WikiPageDetail>(
          `/wiki/${currentTeamId}/pages/${page.slug}/`,
        );
        setPage(refreshed);
        setTitle(refreshed.title);
        setContent(refreshed.content);
        setFrontmatter((refreshed.frontmatter || {}) as Record<string, string>);
      }
    } catch {
      toastError("Publish failed.");
    } finally {
      setPublishBusy(false);
    }
  };

  const reloadPageAfterReview = () => {
    if (!currentTeamId || !page?.slug) return;
    void api
      .get<WikiPageDetail>(`/wiki/${currentTeamId}/pages/${page.slug}/`)
      .then((refreshed) => {
        setPage(refreshed);
        setTitle(refreshed.title);
        setContent(refreshed.content);
        setFrontmatter((refreshed.frontmatter || {}) as Record<string, string>);
      })
      .catch(() => toastError("Could not reload page."));
  };

  useEffect(() => {
    if (loading || (!page && !isNew) || !currentTeamId) return;

    const flushedBody = editorRef.current?.getMarkdown() ?? content;

    // Don't trigger save if content hasn't changed from initial load
    const pageFrontmatter = JSON.stringify((page?.frontmatter || {}) as Record<string, string>);
    const localFrontmatter = JSON.stringify(frontmatter || {});
    if (
      !isNew &&
      page &&
      title === page.title &&
      flushedBody === page.content &&
      pageFrontmatter === localFrontmatter
    ) {
      return;
    }

    setSaveStatus("saving");
    const t = setTimeout(() => {
      const bodyMarkdown = editorRef.current?.getMarkdown() ?? content;
      if (isNew) {
        if (!title.trim() && !bodyMarkdown.trim()) {
          setSaveStatus("idle");
          return;
        }
        api
          .post<WikiPageDetail>(`/wiki/${currentTeamId}/pages/`, {
            title: title || "Untitled",
            content: bodyMarkdown,
            page_type: "standard",
            frontmatter,
          })
          .then((data) => {
            setIsNew(false);
            setPage(data);
            setContent(data.content ?? bodyMarkdown);
            setSaveStatus("saved");
            router.replace(`/wiki?page=${data.slug}`);
            setTimeout(() => setSaveStatus("idle"), 2000);
          })
          .catch(() => {
            setSaveStatus("idle");
            toastError("Failed to create page.");
          });
      } else {
        if (!page) {
          setSaveStatus("idle");
          return;
        }
        api
          .put(`/wiki/${currentTeamId}/pages/${page.slug}/`, {
            title: title || "Untitled",
            content: bodyMarkdown,
            frontmatter,
          })
          .then(() => {
            setPage((prev) =>
              prev ? { ...prev, title: title || "Untitled", content: bodyMarkdown, frontmatter } : prev,
            );
            setContent(bodyMarkdown);
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
          })
          .catch(() => {
            setSaveStatus("idle");
            toastError("Failed to save changes.");
          });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [title, content, frontmatter, isNew, page, currentTeamId, router, loading, toastError]);

  const handleFindCitationSnippet = () => {
    if (!citationSnippet) return;
    try {
      const finder = (window as Window & { find?: (query: string) => boolean }).find;
      finder?.(citationSnippet);
    } catch {
      // no-op: browser support can vary
    }
  };

  if (!currentTeamId) {
    return <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">Select a team first</div>;
  }

  if (!isNew && !page && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-900)] text-center px-4">
        <div className="w-20 h-20 rounded-3xl bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-center mb-6 shadow-xl text-[var(--accent)]">
          <Book className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Team Knowledge Wiki</h2>
        <p className="text-[var(--text-muted)] mb-8 max-w-sm">
          Capture documentation, meeting notes, and decisions. Use <code className="text-[var(--accent)]">[[links]]</code> to connect pages.
        </p>
        <div className="flex gap-4">
          <button 
            onClick={() => router.push("/wiki?action=new")}
            className="px-6 py-2.5 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-[var(--bg-950)] font-bold rounded-xl shadow-lg hover:scale-105 transition-transform"
          >
            Create New Page
          </button>
          <button 
            onClick={() => setWikiSidebarOpen(true)}
            className="px-6 py-2.5 bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium rounded-xl hover:bg-[var(--surface-2)] transition-colors"
          >
            Browse Pages
          </button>
        </div>
        {wikiSidebarOpen && (
          <OpenMarkdown 
            teamId={currentTeamId}
            onOpen={(s) => { setWikiSidebarOpen(false); router.push(`/wiki?page=${s}`); }}
            onClose={() => setWikiSidebarOpen(false)}
            onNewMarkdown={() => router.push("/wiki?action=new")}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-900)] w-full">
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 gap-3 shrink-0">
        <button onClick={() => router.push("/wiki")} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />
        <button onClick={() => setWikiSidebarOpen(true)} className="p-2 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] rounded-lg transition-colors" title="Open Page">
          <FolderOpen className="w-4 h-4" />
        </button>
        
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {!isNew && page && page.citations && page.citations.length > 0 && (
            <button
              onClick={() => setShowCitations(!showCitations)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                showCitations 
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]" 
                  : "bg-[var(--surface-1)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--accent)]"
              }`}
            >
              Citations ({page.citations.length})
            </button>
          )}
          {!isNew && page ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={autoApproveWiki}
                  onChange={(e) => persistWikiAutoApprove(e.target.checked)}
                  className="rounded border-[var(--border-subtle)]"
                />
                Auto-approve
              </label>
              <button
                type="button"
                disabled={publishBusy}
                onClick={() => void handlePublish()}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--bg-950)] hover:opacity-90 disabled:opacity-50"
              >
                {publishBusy ? "Publishing…" : "Publish"}
              </button>
            </>
          ) : null}
          {saveStatus !== "idle" && (
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
              saveStatus === "saving" 
                ? "bg-[var(--warning-bg)] text-[var(--warning)] animate-pulse" 
                : "bg-[var(--success-bg)] text-[var(--success)]"
            }`}>
              <div className={`w-1 h-1 rounded-full ${saveStatus === "saving" ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`} />
              {saveStatus === "saving" ? "Saving..." : "Saved"}
            </div>
          )}
          {loading && (
            <span className="text-xs text-[var(--text-muted)] animate-pulse">Loading...</span>
          )}
        </div>
      </div>

      <div className="px-8 pt-6 pb-4 border-b border-[var(--border-subtle)] shrink-0 max-w-4xl mx-auto w-full">
        {citationSource === "chat" && (citationSnippet || citationChunk || citationAnchorHint) && (
          <div className="mb-4 rounded-lg border border-[var(--accent-subtle)] bg-[var(--surface-1)] px-4 py-3 text-sm">
            <div className="font-semibold text-[var(--text-primary)]">Opened from chat citation</div>
            <div className="mt-1 text-[var(--text-muted)]">
              {citationAnchorHint && (
                <span>
                  Section hint: <span className="text-[var(--text-primary)]">{citationAnchorHint}</span>.{" "}
                </span>
              )}
              {citationChunk && (
                <span>
                  Chunk: <span className="font-mono text-[var(--text-primary)]">{citationChunk}</span>.{" "}
                </span>
              )}
              {citationSnippet && "Use Find snippet to jump close to the referenced text."}
            </div>
            {citationSnippet && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleFindCitationSnippet}
                  className="px-3 py-1.5 rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs"
                >
                  Find snippet
                </button>
                <div className="text-xs text-[var(--text-dim)] truncate">{citationSnippet}</div>
              </div>
            )}
          </div>
        )}
        <input
          className="w-full bg-transparent border-none outline-none text-3xl font-bold text-[var(--text-primary)] placeholder-[var(--text-muted)] opacity-50 focus:opacity-100 transition-opacity"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page Title"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto w-full flex justify-center">
        <div className="max-w-4xl w-full px-8 py-6">
          <FrontmatterPanel frontmatter={frontmatter} onChange={setFrontmatter} />
          <GoogleDocsEditor
            ref={editorRef}
            initialText={content}
            onChange={setContent}
            teamId={currentTeamId}
          />
        </div>

        {/* Citations Sidebar */}
        {showCitations && page?.citations && page.citations.length > 0 && (
          <div className="w-80 border-l border-[var(--border-subtle)] bg-[var(--surface-1)] flex flex-col shrink-0">
            <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center">
              <h3 className="font-semibold text-[var(--text-primary)]">Source Citations</h3>
              <button 
                onClick={() => setShowCitations(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {page.citations.map((c) => (
                <div key={c.id} className="p-3 bg-[var(--surface-2)] rounded-lg border border-[var(--border-subtle)] text-sm">
                  <div className="font-medium text-[var(--accent)] mb-1 flex items-center gap-2">
                    {c.source_type === "pdf" ? "📄" : c.source_type === "youtube" ? "🎬" : "📝"}
                    <span className="truncate" title={c.original_filename}>{c.original_filename}</span>
                  </div>
                  {c.wiki_section && (
                    <div className="text-[var(--text-secondary)] text-xs mb-1">
                      Section: <span className="text-[var(--text-primary)]">{c.wiki_section}</span>
                    </div>
                  )}
                  {c.source_page_number && (
                    <div className="text-[var(--text-muted)] text-xs">
                      Page: {c.source_page_number}
                    </div>
                  )}
                  {c.source_timestamp && (
                    <div className="text-[var(--text-muted)] text-xs">
                      Time: {c.source_timestamp}
                    </div>
                  )}
                  <button 
                    onClick={() => setViewingRawSourceId(c.raw_source_id)}
                    className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
                  >
                    View Raw Source ↗
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {viewingRawSourceId && currentTeamId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8">
          <div className="w-full max-w-4xl max-h-[90vh] bg-[var(--bg-900)] rounded-xl overflow-hidden shadow-2xl border border-[var(--border-subtle)] relative">
            <RawSourceViewer 
              teamId={currentTeamId} 
              sourceId={viewingRawSourceId} 
              onClose={() => setViewingRawSourceId(null)} 
            />
          </div>
        </div>
      )}

      {wikiSidebarOpen && (
        <OpenMarkdown 
          teamId={currentTeamId}
          onOpen={(s) => { setWikiSidebarOpen(false); router.push(`/wiki?page=${s}`); }}
          onClose={() => setWikiSidebarOpen(false)}
          onNewMarkdown={() => router.push("/wiki?action=new")}
        />
      )}

      <WikiPublishReviewModal
        open={Boolean(reviewChangeset)}
        teamId={currentTeamId || ""}
        changeset={reviewChangeset}
        onClose={() => setReviewChangeset(null)}
        onApplied={() => {
          reloadPageAfterReview();
        }}
      />
    </div>
  );
}
