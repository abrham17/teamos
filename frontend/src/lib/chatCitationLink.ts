export type ChatCitationLinkInput = {
  source?: "wiki" | "plan" | string;
  page_slug?: string;
  project_id?: string;
  chunk_id?: string | null;
  anchor_hint?: string | null;
  snippet?: string | null;
  source_kind?: string | null;
  source_ref_id?: string | null;
};

export function buildChatCitationHref(citation: ChatCitationLinkInput): string {
  if ((citation.source || "").toLowerCase() === "plan") {
    const params = new URLSearchParams();
    if (citation.project_id) params.set("project", String(citation.project_id));
    if (citation.chunk_id) params.set("chunk", String(citation.chunk_id));
    if (citation.source_kind) params.set("source_kind", citation.source_kind);
    if (citation.source_ref_id) params.set("source_ref_id", String(citation.source_ref_id));
    params.set("source", "chat");
    const query = params.toString();
    return query ? `/plan?${query}` : "/plan";
  }

  const slug = (citation.page_slug || "").trim();
  if (!slug) return "/wiki";

  const params = new URLSearchParams();
  params.set("page", slug);
  if (citation.chunk_id) params.set("chunk", String(citation.chunk_id));
  if (citation.anchor_hint) params.set("anchor_hint", String(citation.anchor_hint));
  if (citation.snippet) params.set("snippet", String(citation.snippet));
  params.set("source", "chat");
  return `/wiki?${params.toString()}`;
}
