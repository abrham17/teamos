"use client";

import Link from "next/link";
import { FileText, Database, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildChatCitationHref } from "@/lib/chatCitationLink";

export type ChatCitation = {
  source?: "wiki" | "plan" | string;
  title?: string;
  page_slug?: string;
  page_title?: string;
  project_id?: string;
  project_name?: string;
  source_kind?: string;
  confidence?: number;
  anchor_hint?: string;
  chunk_id?: string;
  snippet?: string;
};

function CitationLink({ c }: { c: ChatCitation }) {
  const href = buildChatCitationHref(c);
  const isPlan = (c.source || "").toLowerCase() === "plan";
  const displayTitle = c.title ?? c.page_title ?? c.project_name ?? c.page_slug ?? "Source";
  
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)]/30 hover:shadow-glow transition-all duration-300 group"
    >
      {isPlan ? (
          <Layers className="h-3 w-3 text-[var(--warning)] group-hover:scale-110 transition-transform" />
      ) : (
          <FileText className="h-3 w-3 text-[var(--accent)] group-hover:scale-110 transition-transform" />
      )}
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate max-w-[120px]">
        {displayTitle}
      </span>
      {isPlan && c.source_kind && (
          <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">
              {c.source_kind}
          </span>
      )}
    </Link>
  );
}

export function ChatCitationList({ citations }: { citations: ChatCitation[] }) {
  if (!citations.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2 animate-fade-in">
       {citations.map((c, idx) => (
         <CitationLink key={idx} c={c} />
       ))}
    </div>
  );
}
