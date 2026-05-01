import { describe, expect, it } from "vitest";

import { buildChatCitationHref } from "./chatCitationLink";

describe("buildChatCitationHref", () => {
  it("builds full citation deep-link with all optional params", () => {
    const href = buildChatCitationHref({
      page_slug: "auth-system",
      chunk_id: "chunk-123",
      anchor_hint: "JWT Tokens",
      snippet: "JWT token flow details",
    });

    expect(href).toContain("/wiki?");
    expect(href).toContain("page=auth-system");
    expect(href).toContain("chunk=chunk-123");
    expect(href).toContain("anchor_hint=JWT+Tokens");
    expect(href).toContain("snippet=JWT+token+flow+details");
    expect(href).toContain("source=chat");
  });

  it("falls back to /wiki when page slug is missing", () => {
    const href = buildChatCitationHref({
      page_slug: "",
      snippet: "something",
    });
    expect(href).toBe("/wiki");
  });

  it("includes only required params when optional values absent", () => {
    const href = buildChatCitationHref({ page_slug: "roadmap" });
    expect(href).toBe("/wiki?page=roadmap&source=chat");
  });
});
