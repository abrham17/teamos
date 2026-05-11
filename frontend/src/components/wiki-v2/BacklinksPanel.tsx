import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Link2, Sparkles, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";

interface BacklinksPanelProps {
  teamId: string;
  slug: string;
}

interface Backlink {
  page_slug: string;
  page_title: string;
  snippet: string;
}

interface UnlinkedMention {
  page_slug: string;
  page_title: string;
}

export function BacklinksPanel({ teamId, slug }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedMention[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !slug) return;
    setLoading(true);
    Promise.all([
      api.get(`/wiki/${teamId}/pages/${slug}/backlinks/`).catch(() => []),
      api.get(`/wiki/${teamId}/pages/${slug}/unlinked/`).catch(() => []),
    ])
      .then(([bl, ul]) => {
        setBacklinks(bl as Backlink[]);
        setUnlinked(ul as UnlinkedMention[]);
      })
      .finally(() => setLoading(false));
  }, [teamId, slug]);

  if (loading) return null;
  if (backlinks.length === 0 && unlinked.length === 0) return null;

  return (
    <div className="mt-20 pt-10 border-t border-[var(--border-subtle)] space-y-8">
      {backlinks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <Link2 size={16} className="text-[var(--accent)]" />
            Backlinks
            <span className="bg-[var(--surface-2)] text-[var(--text-muted)] text-[10px] px-2 py-0.5 rounded-full">
              {backlinks.length}
            </span>
          </h3>
          <div className="grid gap-3">
            {backlinks.map((link, idx) => (
              <Link
                key={idx}
                href={`/wiki?page=${link.page_slug}`}
                className="block p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--accent)] transition-colors group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                  <span className="font-medium text-[var(--text-primary)] text-sm">{link.page_title}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                  {link.snippet}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {unlinked.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-[var(--warning)]" />
            Unlinked Mentions
            <span className="bg-[var(--surface-2)] text-[var(--text-muted)] text-[10px] px-2 py-0.5 rounded-full">
              {unlinked.length}
            </span>
          </h3>
          <div className="grid gap-2">
            {unlinked.map((item, idx) => (
              <Link
                key={idx}
                href={`/wiki?page=${item.page_slug}`}
                className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--warning)] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <FileText size={14} className="text-[var(--text-muted)] group-hover:text-[var(--warning)] transition-colors" />
                  <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    {item.page_title}
                  </span>
                </div>
                <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
