export type ChatCitationLinkInput = {
  source?: "wiki" | "plan" | "web" | string;
  page_slug?: string;
  project_id?: string;
  chunk_id?: string | null;
  anchor_hint?: string | null;
  snippet?: string | null;
  source_kind?: string | null;
  source_ref_id?: string | null;
  url?: string | null;
};

export function buildChatCitationHref(citation: ChatCitationLinkInput): string {
  if ((citation.source || "").toLowerCase() === "web") {
    return (citation.url || "").trim() || "#";
  }
  if ((citation.source || "").toLowerCase() === "plan") {
    return "/wiki";
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
