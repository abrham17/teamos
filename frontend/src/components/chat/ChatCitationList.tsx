"use client";

import Link from "next/link";
import { FileText, Layers } from "lucide-react";
import { buildChatCitationHref } from "@/lib/chatCitationLink";
import type { Citation } from "@/components/chat/chatTypes";

function CitationLink({ c }: { c: Citation }) {
  const href = buildChatCitationHref({
    source: c.source,
    page_slug: c.page_slug,
    project_id: c.project_id,
    chunk_id: c.chunk_id,
    anchor_hint: c.anchor_hint,
    snippet: c.snippet,
    source_kind: c.source_kind,
    source_ref_id: c.source_ref_id,
  });
  const isPlan = (c.source || "").toLowerCase() === "plan";
  const displayTitle = c.title ?? c.page_title ?? c.project_name ?? c.page_slug ?? "Source";
  
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border-subtle)] bg-[var(--bg-800)] hover:bg-[var(--bg-700)] hover:border-[var(--border-strong)] transition-colors duration-150 group"
    >
      {isPlan ? (
          <Layers className="h-3 w-3 text-[var(--warning)] shrink-0" />
      ) : (
          <FileText className="h-3 w-3 text-[var(--accent)] shrink-0" />
      )}
      <span className="text-[11px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate max-w-[120px] transition-colors">
        {displayTitle}
      </span>
      {isPlan && c.source_kind && (
          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/15">
              {c.source_kind}
          </span>
      )}
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
