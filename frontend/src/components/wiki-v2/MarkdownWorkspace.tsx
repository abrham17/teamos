"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { ChevronLeft, FolderOpen, Book } from "lucide-react";
import { GoogleDocsEditor } from "../editor/GoogleDocsEditor";
import { OpenMarkdown } from "@/components/wiki-open/OpenMarkdown";
import { useToast } from "@/components/ui/Toast";

export function MarkdownWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTeamId, wikiSidebarOpen, setWikiSidebarOpen } = useWikiStore();
  const { success, error: toastError } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [page, setPage] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isNew, setIsNew] = useState(false);

  const slug = searchParams.get("page");
  const action = searchParams.get("action");

  useEffect(() => {
    if (!currentTeamId) return;

    if (action === "new") {
      setIsNew(true);
      setPage(null);
      setTitle("");
      setContent("");
      setSaveStatus("idle");
      return;
    }

    if (slug) {
      setIsNew(false);
      setLoading(true);
      setSaveStatus("idle");
      api.get(`/wiki/${currentTeamId}/pages/${slug}/`)
        .then((data) => {
          setPage(data);
          setTitle(data.title);
          setContent(data.content);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setPage(null);
      setIsNew(false);
      setSaveStatus("idle");
    }
  }, [currentTeamId, slug, action]);

  useEffect(() => {
    if (loading || (!page && !isNew) || !currentTeamId) return;
    
    // Don't trigger save if content hasn't changed from initial load
    if (!isNew && page && title === page.title && content === page.content) {
      return;
    }

    setSaveStatus("saving");
    const t = setTimeout(() => {
      if (isNew) {
        if (!title.trim() && !content.trim()) {
          setSaveStatus("idle");
          return;
        }
        api.post(`/wiki/${currentTeamId}/pages/`, {
          title: title || "Untitled",
          content: content,
          page_type: "standard"
        }).then((data) => {
          setIsNew(false);
          setSaveStatus("saved");
          router.replace(`/wiki?page=${data.slug}`);
          setTimeout(() => setSaveStatus("idle"), 2000);
        }).catch(() => {
          setSaveStatus("idle");
          toastError("Failed to create page.");
        });
      } else {
        api.put(`/wiki/${currentTeamId}/pages/${page.slug}/`, {
          title: title || "Untitled",
          content: content
        }).then(() => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        }).catch(() => {
          setSaveStatus("idle");
          toastError("Failed to save changes.");
        });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [title, content, isNew, page, currentTeamId, router]);

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
        
        <div className="ml-auto flex items-center gap-3">
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
        <input
          className="w-full bg-transparent border-none outline-none text-3xl font-bold text-[var(--text-primary)] placeholder-[var(--text-muted)] opacity-50 focus:opacity-100 transition-opacity"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page Title"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto w-full flex justify-center">
        <div className="max-w-4xl w-full px-8 py-6">
          <GoogleDocsEditor initialText={content} onChange={setContent} teamId={currentTeamId} />
        </div>
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
