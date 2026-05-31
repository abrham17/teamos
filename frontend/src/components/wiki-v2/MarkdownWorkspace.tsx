"use client";

import { useEffect, useRef, useState, useMemo, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { ChevronLeft, FolderOpen } from "lucide-react";
import { GoogleDocsEditor, type GoogleDocsEditorHandle } from "../editor/GoogleDocsEditor";
import { OpenMarkdown } from "@/components/wiki-open/OpenMarkdown";
import FrontmatterPanel from "@/components/wiki/FrontmatterPanel";
import { useToast } from "@/components/ui/Toast";
import { WikiPublishReviewModal, type WikiChangeSetPayload } from "@/components/wiki-v2/WikiPublishReviewModal";
import RawSourceViewer from "@/components/wiki/RawSourceViewer";
import { BacklinksPanel } from "./BacklinksPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ICONSCOUT } from "@/lib/iconscoutAssets";

interface Citation {
  id: string;
  raw_source_id: string;
  source_type: string;
  original_filename: string;
  wiki_section: string;
  source_char_start: number;
  source_char_end: number;
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function scrollToHeading(headingText: string) {
  const id = slugify(headingText);
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("citation-highlight");
    setTimeout(() => el.classList.remove("citation-highlight"), 3000);
    return true;
  }
  // Fallback: try browser find
  try {
    const finder = (window as Window & { find?: (query: string) => boolean }).find;
    return finder?.(headingText) ?? false;
  } catch {
    return false;
  }
}

/** Prefer live editor markdown, then React state, then last saved page body. */
function resolveBodyMarkdown(
  editorRef: RefObject<GoogleDocsEditorHandle | null>,
  content: string,
  savedContent?: string,
): string {
  const fromEditor = editorRef.current?.getMarkdown()?.trim() ?? "";
  if (fromEditor) return fromEditor;
  const fromState = content.trim();
  if (fromState) return fromState;
  return (savedContent ?? "").trim();
}

export function MarkdownWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTeamId, wikiSidebarOpen, setWikiSidebarOpen, zenMode, setZenMode } = useWikiStore();
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
  const [showToc, setShowToc] = useState(false);
  const [viewingRawSourceId, setViewingRawSourceId] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  const slug = searchParams.get("page");
  const action = searchParams.get("action");
  const citationSnippet = searchParams.get("snippet");
  const citationChunk = searchParams.get("chunk");
  const citationAnchorHint = searchParams.get("anchor_hint");
  const citationSource = searchParams.get("source");
  const newTitleParam = searchParams.get("title");

  const toc = useMemo(() => {
    if (!content) return [];
    const lines = content.split('\n');
    const headings = [];
    for (const line of lines) {
      const match = line.match(/^(#{1,3})\s+(.*)/);
      if (match) {
        headings.push({ level: match[1].length, text: match[2] });
      }
    }
    return headings;
  }, [content]);

  // Global Cmd+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setWikiSidebarOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setWikiSidebarOpen]);

  useEffect(() => {
    if (!currentTeamId) return;

    if (action === "new") {
      setIsNew(true);
      setPage(null);
      setTitle(newTitleParam || "");
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
  }, [currentTeamId, slug, action, newTitleParam]);

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

  // Scroll to heading referenced by citation anchor_hint after page loads
  useEffect(() => {
    if (loading || !citationAnchorHint) return;
    const timer = setTimeout(() => {
      scrollToHeading(citationAnchorHint);
    }, 500);
    return () => clearTimeout(timer);
  }, [loading, citationAnchorHint]);

  // Highlight citation snippet text in the editor DOM after content loads
  useEffect(() => {
    if (loading || !citationSnippet) return;
    const timer = setTimeout(() => {
      const prose = document.querySelector(".tiptap");
      if (!prose) return;
      const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.textContent?.includes(citationSnippet)) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const start = node.textContent.indexOf(citationSnippet);
          range.setStart(node, start);
          range.setEnd(node, start + citationSnippet.length);
          const mark = document.createElement("mark");
          mark.className = "citation-snippet-highlight";
          range.surroundContents(mark);
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => mark.classList.add("citation-snippet-fade"), 100);
          break;
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [loading, citationSnippet]);

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
    const bodyMarkdown = resolveBodyMarkdown(editorRef, content, page.content);
    if (!bodyMarkdown) {
      toastError("Cannot publish an empty page. Add some content first.");
      return;
    }
    setPublishBusy(true);
    try {
      const data = await api.post<{
        mode: string;
        changeset?: WikiChangeSetPayload | null;
        job?: unknown;
      }>(`/wiki/${currentTeamId}/pages/${page.slug}/publish/`, {
        auto_approve: autoApproveWiki,
        content: bodyMarkdown,
        title: title,
      });
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
    } catch (error) {
      toastError(getErrorMessage(error, "Publish failed."));
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

    const flushedBody = resolveBodyMarkdown(editorRef, content, page?.content);

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
      const bodyMarkdown = resolveBodyMarkdown(editorRef, content, page?.content);

      // Editor not ready: avoid overwriting saved content with an empty body.
      if (!bodyMarkdown.trim() && (content.trim() || page?.content?.trim())) {
        console.warn("Blocking empty save - editor might not be ready");
        setSaveStatus("idle");
        return;
      }

      if (isNew) {
        if (!bodyMarkdown.trim()) {
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
          .catch((error) => {
            setSaveStatus("idle");
            toastError(getErrorMessage(error, "Failed to create page."));
          });
      } else {
        if (!page) {
          setSaveStatus("idle");
          return;
        }
        api
          .put<WikiPageDetail>(`/wiki/${currentTeamId}/pages/${page.slug}/`, {
            title: title || "Untitled",
            content: bodyMarkdown,
            frontmatter,
          })
          .then((updatedPage) => {
            const prevSlug = page.slug;
            setPage(updatedPage);
            setTitle(updatedPage.title);
            setContent(updatedPage.content ?? bodyMarkdown);
            setFrontmatter((updatedPage.frontmatter || {}) as Record<string, string>);
            if (updatedPage.slug && updatedPage.slug !== prevSlug) {
              router.replace(`/wiki?page=${updatedPage.slug}`);
            }
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
          })
          .catch((error) => {
            setSaveStatus("idle");
            toastError(getErrorMessage(error, "Failed to save changes."));
          });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [title, content, frontmatter, isNew, page, currentTeamId, router, loading, toastError]);

  const handleFindCitationSnippet = () => {
    if (!citationSnippet) return;
    if (citationAnchorHint) {
      scrollToHeading(citationAnchorHint);
      return;
    }
    // Use anchor-based scroll first, fall back to browser find
    const scrolled = scrollToHeading(citationSnippet);
    if (!scrolled) {
      try {
        const finder = (window as Window & { find?: (query: string) => boolean }).find;
        finder?.(citationSnippet);
      } catch {
        // no-op
      }
    }
  };

  if (!currentTeamId) {
    return <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">Select a team first</div>;
  }

  if (!isNew && !page && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-900)] text-center px-4">
        <EmptyState
          illustrationSrc={ICONSCOUT.illustrations.emptyWiki}
          illustrationAlt="Team knowledge wiki"
          title="Team Knowledge Wiki"
          description="Capture documentation, meeting notes, and decisions. Use [[links]] to connect pages and grow your knowledge graph."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => router.push("/wiki?action=new")}
                className="px-5 py-2.5 bg-[var(--accent)] text-[var(--bg-950)] font-semibold rounded-xl hover:bg-[var(--accent)]/95 transition-all"
              >
                Create New Page
              </button>
              <button
                onClick={() => setWikiSidebarOpen(true)}
                className="px-5 py-2.5 bg-[var(--bg-800)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium rounded-xl hover:bg-[var(--bg-700)] hover:border-[var(--border-strong)] transition-colors shadow-[var(--shadow-sm)]"
              >
                Browse Pages
              </button>
            </div>
          }
        />
        {wikiSidebarOpen && (
          <OpenMarkdown
            teamId={currentTeamId}
            onOpen={(s) => { setWikiSidebarOpen(false); router.push(`/wiki?page=${s}`); }}
            onClose={() => setWikiSidebarOpen(false)}
            onNewMarkdown={(t) => router.push(`/wiki?action=new${t ? `&title=${encodeURIComponent(t)}` : ''}`)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-950)] w-full overflow-hidden">
      {/* Header */}
      <div className={`flex items-center h-14 px-6 gap-3 shrink-0 z-20 transition-all ${
        zenMode 
          ? "bg-transparent border-none" 
          : "border-b border-[var(--border-subtle)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]"
      }`}>
        {!zenMode && (
          <>
            <button
              onClick={() => router.push("/wiki")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-all active:scale-95"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Wiki</span>
            </button>

            <div className="w-px h-5 bg-[var(--border-strong)]" />

            <button
              onClick={() => setWikiSidebarOpen(true)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] rounded-lg transition-all active:scale-95"
              title="Open Library"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </>
        )}

        <div className="flex-1 min-w-0 mx-2">
          <input
            className={`w-full bg-transparent border-none outline-none font-semibold placeholder:text-[var(--text-dim)] transition-all ${
              zenMode ? "text-[20px] font-bold text-center text-[var(--text-primary)]" : "text-[15px] text-[var(--text-primary)]"
            }`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            disabled={zenMode}
          />
        </div>

        <div className="flex items-center gap-2.5">
          {!zenMode && saveStatus !== "idle" && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-500 ${
              saveStatus === "saving"
                ? "text-[var(--warning)] bg-[var(--warning-bg)]"
                : "text-[var(--success)] bg-[var(--success-bg)]"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${saveStatus === "saving" ? "bg-[var(--warning)] animate-pulse" : "bg-[var(--success)]"}`} />
              {saveStatus === "saving" ? "Saving" : "Saved"}
            </div>
          )}

          <button
            onClick={() => setZenMode(!zenMode)}
            className={`text-[12px] px-3 py-1.5 rounded-lg border transition-all font-medium ${
              zenMode
                ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20 hover:bg-[var(--accent)] hover:text-[var(--bg-950)]"
                : "bg-[var(--bg-700)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
            }`}
            title="Toggle Zen Mode"
          >
            {zenMode ? "Exit Zen" : "Zen Mode"}
          </button>

          {!zenMode && toc.length > 0 && (
            <button
              onClick={() => {
                setShowToc(!showToc);
                if (showCitations) setShowCitations(false);
              }}
              className={`text-[12px] px-3 py-1.5 rounded-lg border transition-all font-medium ${
                showToc
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--border-subtle)]"
                  : "bg-[var(--bg-700)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
              }`}
            >
              Outline
            </button>
          )}

          {!zenMode && !isNew && page && page.citations && page.citations.length > 0 && (
            <button
              onClick={() => {
                setShowCitations(!showCitations);
                if (showToc) setShowToc(false);
              }}
              className={`text-[12px] px-3 py-1.5 rounded-lg border transition-all font-medium ${
                showCitations
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--border-subtle)]"
                  : "bg-[var(--bg-700)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
              }`}
            >
              Citations ({page.citations.length})
            </button>
          )}

          {!zenMode && !isNew && page ? (
            <div className="flex items-center gap-2">
              <label className="hidden sm:flex cursor-pointer items-center gap-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                <input
                  type="checkbox"
                  checked={autoApproveWiki}
                  onChange={(e) => persistWikiAutoApprove(e.target.checked)}
                  className="rounded border-[var(--border-strong)] bg-[var(--bg-700)] accent-[var(--accent)]"
                />
                Auto-approve
              </label>
              <button
                type="button"
                disabled={publishBusy || !resolveBodyMarkdown(editorRef, content, page.content)}
                onClick={() => void handlePublish()}
                className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[12px] font-semibold text-[var(--bg-950)] active:scale-95 disabled:opacity-50 transition-all hover:bg-[var(--accent)]/95"
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
                  key={page?.slug ?? (isNew ? "new" : slug ?? "wiki")}
                  ref={editorRef}
                  initialText={content}
                  onChange={setContent}
                  teamId={currentTeamId}
                />
              </div>

              {!isNew && page?.slug && currentTeamId && (
                <BacklinksPanel teamId={currentTeamId} slug={page.slug} />
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Table of Contents Sidebar */}
        {!zenMode && showToc && !showCitations && toc.length > 0 && (
          <div className="w-56 border-l border-[var(--border-subtle)] bg-[var(--bg-900)] flex flex-col shrink-0 animate-in fade-in duration-300 overflow-y-auto">
            <div className="p-5">
              <h3 className="font-semibold text-[11px] uppercase tracking-widest text-[var(--text-dim)] mb-4">On this page</h3>
              <div className="flex flex-col gap-1">
                {toc.map((heading, idx) => (
                  <div
                    key={idx}
                    className={`text-[12px] cursor-pointer hover:text-[var(--accent)] hover:translate-x-0.5 transition-all py-0.5 ${
                      heading.level === 1 ? "font-medium text-[var(--text-secondary)]" :
                      heading.level === 2 ? "pl-3 text-[var(--text-muted)]" :
                      "pl-6 text-[var(--text-dim)]"
                    }`}
                    onClick={() => scrollToHeading(heading.text)}
                  >
                    {heading.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Citations Sidebar */}
        {!zenMode && showCitations && page?.citations && page.citations.length > 0 && (
          <div className="w-80 border-l border-[var(--border-subtle)] bg-[var(--bg-900)] flex flex-col shrink-0 animate-in slide-in-from-right duration-300">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex justify-between items-center">
              <h3 className="font-semibold text-[14px] text-[var(--text-primary)] tracking-tight">Citations</h3>
              <button
                onClick={() => setShowCitations(false)}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] rounded-lg transition-all"
              >
                <span className="text-[13px]">✕</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {page.citations.map((c) => (
                <div key={c.id} className="group p-4 bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/30 transition-all shadow-md relative overflow-hidden">
                  <div className="font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2 text-[13px]">
                    <span className="text-[var(--accent)]">{c.source_type === "pdf" ? "📄" : c.source_type === "youtube" ? "�" : "📝"}</span>
                    <span className="truncate" title={c.original_filename}>{c.original_filename}</span>
                  </div>
                  <div className="space-y-1.5">
                    {c.wiki_section && (
                      <div className="text-[12px] flex justify-between">
                        <span className="text-[var(--text-dim)]">Section</span>
                        <span className="font-medium text-[var(--text-secondary)]">{c.wiki_section}</span>
                      </div>
                    )}
                    {c.source_page_number && (
                      <div className="text-[12px] flex justify-between">
                        <span className="text-[var(--text-dim)]">Page</span>
                        <span className="font-medium text-[var(--text-secondary)]">{c.source_page_number}</span>
                      </div>
                    )}
                    {c.source_timestamp && (
                      <div className="text-[12px] flex justify-between">
                        <span className="text-[var(--text-dim)]">Timestamp</span>
                        <span className="font-medium text-[var(--text-secondary)]">{c.source_timestamp}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCitation(c);
                      setViewingRawSourceId(c.raw_source_id);
                    }}
                    className="mt-3.5 w-full py-2 rounded-xl bg-[var(--accent-subtle)] hover:bg-[var(--accent)] text-[var(--accent)] hover:text-[var(--bg-950)] text-[12px] font-bold transition-all border border-[var(--accent)]/10"
                  >
                    View Source
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {viewingRawSourceId && currentTeamId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-8 animate-in fade-in duration-200">
          <div className="w-full max-w-6xl h-[90vh] bg-[var(--bg-900)] rounded-2xl overflow-hidden shadow-[var(--shadow-lg)] border border-[var(--border-strong)] relative">
            <RawSourceViewer 
              teamId={currentTeamId} 
              sourceId={viewingRawSourceId} 
              highlightStart={selectedCitation?.source_char_start}
              highlightEnd={selectedCitation?.source_char_end}
              onClose={() => {
                setViewingRawSourceId(null);
                setSelectedCitation(null);
              }} 
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
          onNewMarkdown={(t) => router.push(`/wiki?action=new${t ? `&title=${encodeURIComponent(t)}` : ''}`)}
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
