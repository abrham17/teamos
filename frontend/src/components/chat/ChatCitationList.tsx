"use client";

import Link from "next/link";
import { ExternalLink, FileText, Globe, Layers } from "lucide-react";
import { buildChatCitationHref } from "@/lib/chatCitationLink";
import type { Citation } from "@/components/chat/chatTypes";

function CitationLink({ c }: { c: Citation }) {
  const href = buildChatCitationHref({
    source: c.source,
    page_slug: c.page_slug,
    chunk_id: c.chunk_id,
    anchor_hint: c.anchor_hint,
    snippet: c.snippet,
    source_kind: c.source_kind,
    source_ref_id: c.source_ref_id,
    url: c.url,
  });
  const isWeb = (c.source || "").toLowerCase() === "web";
  const displayTitle = c.title ?? c.page_title ?? c.page_slug ?? "Source";
  const classes = "flex items-center gap-2 px-3 py-1.5 border border-[var(--border-subtle)] bg-[var(--bg-800)] hover:bg-[var(--bg-700)] hover:border-[var(--border-strong)] transition-colors duration-150 group";

  if (isWeb) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        <Globe className="h-3 w-3 text-[var(--success)] shrink-0" />
        <span className="text-[11px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate max-w-[120px] transition-colors">
          {displayTitle}
        </span>
        <ExternalLink className="h-3 w-3 text-[var(--text-dim)] shrink-0" />
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      <FileText className="h-3 w-3 text-[var(--accent)] shrink-0" />
      <span className="text-[11px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate max-w-[120px] transition-colors">
        {displayTitle}
      </span>
    </Link>
  );
}

export function ChatCitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2 animate-fade-in">
       {citations.map((c, idx) => (
         <CitationLink key={idx} c={c} />
       ))}
    </div>
  );
}
