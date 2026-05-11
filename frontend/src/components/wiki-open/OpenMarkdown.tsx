"use client";

import { useState, useEffect } from "react";
import { Search, FileText, RefreshCw, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

type Page = {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
  page_type?: string;
  tags?: string[];
};

interface OpenMarkdownProps {
  teamId: string;
  onOpen: (pageId: string) => void;
  onClose: () => void;
  onNewMarkdown?: (title: string) => void;
}

export function OpenMarkdown({ teamId, onOpen, onClose, onNewMarkdown }: OpenMarkdownProps) {
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewHint, setShowNewHint] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const query = search.trim();
        if (query) {
          const data = await api.get<Page[]>(`/wiki/${teamId}/search/?q=${encodeURIComponent(query)}`);
          setPages(data);
        } else {
          const data = await api.get<Page[]>(`/wiki/${teamId}/recent/`);
          setPages(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce
    return () => clearTimeout(timeout);
  }, [teamId, search]);

  useEffect(() => {
    setSelectedIndex(0);
    if (!search.trim()) {
      setShowNewHint(false);
      return;
    }
    setShowNewHint(pages.length === 0 && !!onNewMarkdown);
  }, [search, pages.length, onNewMarkdown]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < pages.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (pages.length > 0) {
        onOpen(pages[selectedIndex].slug);
      } else if (showNewHint && onNewMarkdown) {
        onClose();
        onNewMarkdown(search);
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-3 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[800px] bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-900)]">
          <Search className="w-5 h-5 text-[var(--accent)] ml-4" />
          <input
            className="w-full bg-transparent border-none outline-none p-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search team pages (⌘K)..."
            autoFocus
          />
          {loading && <RefreshCw className="w-4 h-4 animate-spin mr-4 text-[var(--accent)]" />}
        </div>

        <div className="flex-1 max-h-[60vh] overflow-y-auto py-2 bg-[var(--surface-1)]">
          {pages.map((page, index) => (
            <div
              key={page.id}
              onClick={() => onOpen(page.slug)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`group flex justify-between items-center px-5 py-3 cursor-pointer border-l-2 ${
                selectedIndex === index
                  ? "bg-[var(--bg-800)] border-[var(--accent)]"
                  : "border-transparent hover:bg-[var(--bg-800)] hover:border-[var(--accent)]"
              }`}
            >
              <div className="flex items-center gap-4">
                <FileText className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
                <div>
                  <div className="text-[15px] font-medium text-[var(--text-primary)]">
                    {page.title}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                    <span>{new Date(page.updated_at).toLocaleDateString()}</span>
                    {page.page_type && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-950)] text-[10px] uppercase">
                        {page.page_type}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}

          {!loading && pages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <FileText className="w-8 h-8 mb-3 opacity-20" />
              <p>No pages found.</p>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-950)] px-6 py-3 flex justify-between text-xs text-[var(--text-muted)]">
          <span>↑↓ navigate • Enter open • Esc close</span>
          {showNewHint && (
            <button
              onClick={() => {
                onClose();
                onNewMarkdown?.(search);
              }}
              className="text-[var(--accent)] font-medium hover:underline"
            >
              Create new &quot;{search}&quot; →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
