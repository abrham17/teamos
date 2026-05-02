"use client";

import Link from "next/link";
import { FileText } from "lucide-react";

import { buildChatCitationHref } from "@/lib/chatCitationLink";

export type ChatCitation = {
  page_slug?: string;
  page_title?: string;
  confidence?: number;
  anchor_hint?: string;
  chunk_id?: string;
  snippet?: string;
};

const MANY_THRESHOLD = 4;

function CitationLink({ c, idx }: { c: ChatCitation; idx: number }) {
  const href = buildChatCitationHref(c);
  const title = c.anchor_hint ? `Jump hint: ${c.anchor_hint}` : "Open source page";
  return (
    <li key={idx}>
      <Link
        href={href}
        title={title}
        className="inline-flex max-w-full items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-[var(--text-muted)] underline-offset-2 transition-colors hover:border-[var(--border-subtle)] hover:bg-[var(--bg-800)] hover:text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--border-subtle)]"
      >
        <FileText className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 truncate">{c.page_title ?? c.page_slug ?? "Source"}</span>
        {c.confidence != null ? (
          <span className="shrink-0 tabular-nums text-[10px] text-[var(--text-dim)]">
            {Math.round(c.confidence * 100)}%
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function ChatCitationList({ citations }: { citations: ChatCitation[] }) {
  if (!citations.length) return null;

  const list = (
    <ul className="mt-1 list-none space-y-0.5 pl-0 text-sm">
      {citations.map((c, idx) => (
        <CitationLink key={idx} c={c} idx={idx} />
      ))}
    </ul>
  );

  if (citations.length >= MANY_THRESHOLD) {
    return (
      <details className="group mt-2 max-w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)]/80 px-3 py-2 text-[var(--text-muted)] open:bg-[var(--bg-900)]">
        <summary className="cursor-pointer select-none text-xs font-medium text-[var(--text-dim)] outline-none marker:text-[var(--text-dim)] hover:text-[var(--text-secondary)] focus-visible:rounded focus-visible:text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--border-subtle)]">
          Sources ({citations.length})
        </summary>
        {list}
      </details>
    );
  }

  return (
    <div className="mt-2 max-w-full">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-dim)]">Sources</div>
      {list}
    </div>
  );
}
