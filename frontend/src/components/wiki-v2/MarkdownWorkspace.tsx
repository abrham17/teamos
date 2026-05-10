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
import { FloatingAIChat } from "@/components/chat/FloatingAIChat";

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
      
      // CRITICAL: If the editor returns empty but we have content in state, 
      // it might mean the editor hasn't finished loading. DON'T SAVE.
      if (!bodyMarkdown.trim() && (content.trim() || page?.content?.trim())) {
        console.warn("Blocking empty save - editor might not be ready");
        setSaveStatus("idle");
        return;
      }

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
    <div className="flex flex-col h-full bg-[var(--bg-950)] w-full overflow-hidden">
      {/* Premium Header */}
      <div className="flex items-center h-16 border-b border-white/5 bg-[var(--bg-950)]/80 backdrop-blur-xl px-6 gap-4 shrink-0 z-20">
        <button 
          onClick={() => router.push("/wiki")} 
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Dashboard</span>
        </button>
        
        <div className="w-px h-6 bg-white/10 mx-1" />
        
        <button 
          onClick={() => setWikiSidebarOpen(true)} 
          className="p-2.5 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] rounded-xl transition-all active:scale-95" 
          title="Open Library"
        >
          <FolderOpen className="w-5 h-5" />
        </button>
        
        <div className="flex-1 min-w-0 mx-4">
          <input
            className="w-full bg-transparent border-none outline-none text-lg font-semibold text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:placeholder-white/20 transition-all"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Document"
          />
        </div>

        <div className="flex items-center gap-4">
          {saveStatus !== "idle" && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-500 border ${
              saveStatus === "saving" 
                ? "bg-[var(--warning-bg)]/20 text-[var(--warning)] border-[var(--warning)]/30 animate-pulse" 
                : "bg-[var(--success-bg)]/20 text-[var(--success)] border-[var(--success)]/30"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${saveStatus === "saving" ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`} />
              {saveStatus === "saving" ? "Syncing" : "Saved"}
            </div>
          )}

          {!isNew && page && page.citations && page.citations.length > 0 && (
            <button
              onClick={() => setShowCitations(!showCitations)}
              className={`text-xs px-4 py-2 rounded-xl border transition-all font-medium ${
                showCitations 
                  ? "bg-[var(--accent)] text-[var(--bg-950)] border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]" 
                  : "bg-white/5 text-[var(--text-secondary)] border-white/10 hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              }`}
            >
              Citations ({page.citations.length})
            </button>
          )}

          {!isNew && page ? (
            <div className="flex items-center gap-2">
              <label className="hidden sm:flex cursor-pointer items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                <input
                  type="checkbox"
                  checked={autoApproveWiki}
                  onChange={(e) => persistWikiAutoApprove(e.target.checked)}
                  className="rounded-sm border-white/20 bg-white/5 checked:bg-[var(--accent)]"
                />
                Auto-approve
              </label>
              <button
                type="button"
                disabled={publishBusy}
                onClick={() => void handlePublish()}
                className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 py-2 text-xs font-bold text-[var(--bg-950)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all"
              >
                {publishBusy ? "Publishing…" : "Publish"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Main Editor Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-950)]">
          <div className="max-w-5xl mx-auto w-full min-h-full flex flex-col">
            {citationSource === "chat" && (citationSnippet || citationChunk || citationAnchorHint) && (
              <div className="m-8 mb-0 rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-subtle)]/10 p-6 backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-2 font-bold text-[var(--accent)] mb-2 uppercase tracking-tighter text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  AI Context Bridge
                </div>
                <div className="text-[var(--text-secondary)] text-sm leading-relaxed">
                  {citationAnchorHint && (
                    <span>
                      Referencing section: <span className="text-[var(--text-primary)] font-semibold">{citationAnchorHint}</span>.{" "}
                    </span>
                  )}
                  {citationChunk && (
                    <span>
                      Data chunk ID: <span className="font-mono text-[var(--accent)]">{citationChunk}</span>.{" "}
                    </span>
                  )}
                  {citationSnippet && "We've located the specific passage referenced in your discussion."}
                </div>
                {citationSnippet && (
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={handleFindCitationSnippet}
                      className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--bg-950)] font-bold text-xs hover:shadow-lg transition-all active:scale-95"
                    >
                      Jump to passage
                    </button>
                    <div className="text-xs text-[var(--text-muted)] italic truncate max-w-md border-l border-white/10 pl-3">
                      &quot;{citationSnippet}&quot;
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="px-8 py-10 flex-1">
              <FrontmatterPanel frontmatter={frontmatter} onChange={setFrontmatter} />
              <div className="mt-6">
                <GoogleDocsEditor
                  ref={editorRef}
                  initialText={content}
                  onChange={setContent}
                  teamId={currentTeamId}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Citations Sidebar */}
        {showCitations && page?.citations && page.citations.length > 0 && (
          <div className="w-96 border-l border-white/5 bg-[var(--bg-950)]/50 backdrop-blur-2xl flex flex-col shrink-0 animate-in slide-in-from-right duration-500">
            <div className="p-6 border-b border-white/5 flex justify-between items-center">
              <h3 className="font-bold text-lg text-[var(--text-primary)] tracking-tight">Citations</h3>
              <button 
                onClick={() => setShowCitations(false)}
                className="p-2 text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {page.citations.map((c) => (
                <div key={c.id} className="group p-5 bg-white/[0.02] hover:bg-white/[0.05] rounded-2xl border border-white/5 transition-all duration-300">
                  <div className="font-bold text-[var(--accent)] mb-2 flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                    {c.source_type === "pdf" ? "📄" : c.source_type === "youtube" ? "🎬" : "📝"}
                    <span className="truncate" title={c.original_filename}>{c.original_filename}</span>
                  </div>
                  <div className="space-y-1.5">
                    {c.wiki_section && (
                      <div className="text-[var(--text-secondary)] text-xs flex justify-between">
                        <span className="text-[var(--text-muted)]">Section</span>
                        <span className="font-medium text-[var(--text-primary)]">{c.wiki_section}</span>
                      </div>
                    )}
                    {c.source_page_number && (
                      <div className="text-[var(--text-secondary)] text-xs flex justify-between">
                        <span className="text-[var(--text-muted)]">Page</span>
                        <span className="font-medium text-[var(--text-primary)]">{c.source_page_number}</span>
                      </div>
                    )}
                    {c.source_timestamp && (
                      <div className="text-[var(--text-secondary)] text-xs flex justify-between">
                        <span className="text-[var(--text-muted)]">Timestamp</span>
                        <span className="font-medium text-[var(--text-primary)]">{c.source_timestamp}</span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => setViewingRawSourceId(c.raw_source_id)}
                    className="mt-4 w-full py-2 bg-white/5 hover:bg-[var(--accent)] hover:text-[var(--bg-950)] text-xs font-bold rounded-xl transition-all border border-white/5"
                  >
                    Explore Raw Source
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {viewingRawSourceId && currentTeamId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-8 animate-in fade-in duration-300">
          <div className="w-full max-w-6xl h-[90vh] bg-[var(--bg-900)] rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 relative">
            <RawSourceViewer 
              teamId={currentTeamId} 
              sourceId={viewingRawSourceId} 
              onClose={() => setViewingRawSourceId(null)} 
              fullHeight
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

      <FloatingAIChat />
    </div>
  );
}
