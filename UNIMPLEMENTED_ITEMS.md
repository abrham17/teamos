# TeamOS — Remaining Unimplemented Items

This file tracks the key gaps between current repository state and `TEAMOS_PLAN.md`.

---

## Priority Legend

- `P0` = critical for production correctness/security
- `P1` = core planned functionality not complete
- `P2` = polish/advanced features

---

## 1) Ingestion Module

- `P0` Real parser coverage for files:
  - PDF and DOCX parsing currently not full structured extraction as planned (`unstructured`-style elements).
- `P0` Vector embedding + store:
  - chunk embedding generation and push to Qdrant collection `team_{id}` not fully implemented.
- `P1` Dedup behavior:
  - SHA-256 hash exists per chunk, but global dedup skip/update strategy is incomplete.
- `P1` Stage progress streaming:
  - no user-facing stage-by-stage SSE/WebSocket progress events for parse/chunk/embed/tag/graph.
- `P1` Auto-tagging pipeline:
  - no structured LLM metadata extraction (`topic`, `keywords`, `related_pages`) wired end-to-end.
- `P1` **Raw Data Persistence & Grounding**:
  - Implementation must save the full raw source content (text/binary) in the database/S3.
  - Wiki pages must support "Exact Citations" to these raw sources (e.g. citing a specific paragraph or table from an ingested PDF) within the markdown content.
- `P1` **LM Wiki: Incremental Integration**:
  - Ingestion currently only creates/replaces a single page. Needs "Merge" logic to identify existing entity pages (e.g. "Project X") and update them with new information from the source.
- `P1` **Code & Repository Ingestion**:
  - Support for ingesting entire Git repositories (via URL) or local code directories (direct upload).
  - Must include code-specific chunking and "Project Map" wiki page generation.
- `P2` **Multi-Modal Vision Ingestion**:
  - Use Vision-LLMs to parse charts, architecture diagrams, and tables from PDFs into structured wiki concepts.

---

## 2) Interlinked Wiki Module

- `P1` Full create/open workspace parity:
  - create flows like `/wiki/new` with all template + ingest entry paths need completion checks.
- `P1` Frontmatter workflow:
  - full form-driven frontmatter editing and round-trip behavior still partial.
- `P2` Advanced editor command UX:
  - slash command completeness and quality parity with plan not fully verified.
- `P1` **Deep-Linked Citations**:
  - Implementation of `[[wikilinks]]` must support clicking to open the target page directly in the TipTap editor.
  - Support for "Transclusion/Citations" from other wiki pages or raw data sources with a link to navigate to the exact source page.
- `P2` **Editor Toolbars**:
  - Implement a basic-to-medium floating and fixed toolbar for common markdown formatting (Bold, Italic, Lists, Headings, Tables, Code, WikiLinks).
- `P1` **Real-time Co-editing (CRDT)**:
  - Integration of Yjs or similar technology to support multiple editors on the same page simultaneously with presence cursor visibility.
- `P2` **Dynamic "Dataview" Dashboards**:
  - Support for live-query blocks in markdown (e.g. "Show all pages with tag #project") that render as dynamic tables/lists.

---

## 3) Knowledge Graph Module

- `P1` Community detection quality:
  - current cluster logic is connected-components proxy; true Louvain-level community detection still pending.
- `P1` **LM Wiki: Model-Driven Linking**:
  - inferred edges are currently heuristic token-overlap. Needs to be replaced with LLM semantic inference to link conceptually related pages (e.g. "Quantum Computing" → "Physics") without keyword overlap.
- `P2` Full graph interaction polish:
  - some advanced UI interactions/visual states from plan still partial.
- `P2` **Citational Edge Visibility**:
  - The graph should visualize citations and "exact links" as a specific edge type.
  - Clicking an edge should show the citation context and provide a direct "Open in Editor" shortcut for both nodes.

---

## 4) Team Chat (Citational) Module

- `P0` Full RAG retrieval stack:
  - BM25 + dense retrieval + RRF merge not fully implemented.
- `P0` Re-ranking by tier:
  - cross-encoder reranker behavior (team/pro) not fully implemented.
- `P0` **Interactive Chat Citations**:
  - Streamed citations in chat must be "Actionable." Clicking a citation chip must navigate the user to the exact section in the Wiki and automatically open the **Markdown Editor** for that page.
- `P1` Query understanding by tier:
  - intent classification + multi-query expansion not fully wired.
- `P1` Context assembly budget enforcement:
  - strict plan-tier token budget and chunk-prefix policy not fully enforced.
- `P1` History compression:
  - rolling summary/memory compression after N turns is partial or absent.
- `P1` **LM Wiki: File-back Operation**:
  - Chat currently read-only. Needs "Agentic Tooling" to allow the LLM to propose edits to existing wiki pages (e.g. "I found a contradiction, should I update the Roadmap page?") based on chat synthesis.

---

## 5) Team Management Module

- `P1` Presence full implementation:
  - real-time presence is present in structure but full UX + reliability behavior from plan needs completion.
- `P1` Invite email operations robustness:
  - retries/backoff/templates/provider integration hardening pending.
- `P2` Audit/UI completeness:
  - audit events exist for invite flows, but broader team activity audit scope is incomplete.

---

## 6) Export Module

- `P1` Full export parity validation:
  - verify all plan outputs are complete:
  - single page `.md`
  - selected pages `.zip`
  - full wiki `.zip` with `_graph.json` and preserved `[[wikilinks]]`
- `P1` Error handling and large-export behavior:
  - partial-failure reporting and async export scalability behaviors need hardening.
- `P2` Export schema guarantees:
  - explicit schema/versioning for `_graph.json` not fully formalized.

---

## 7) Cross-Cutting Platform Gaps

- `P0` Automated tests:
  - backend coverage is still sparse in many modules.
- `P0` CI pipeline:
  - no strong lint/test/security gate pipeline verified for PRs.
- `P0` Production observability:
  - centralized structured logging, metrics, and traceability still limited.
- `P1` Deployment hardening:
  - reproducible infra/deployment docs and environment parity need completion.
- `P1` Secrets/config hygiene:
  - ongoing cleanup/validation around env naming consistency and example files required.

---

## 8) LM Wiki: Review & Governance Workflow

- `P1` **Auto-Approve Toggle & State**:
  - Implement a team-level or ingest-level "Auto-Approve" setting.
  - If disabled, ingestion jobs must halt after analysis and enter a `review_required` state.
- `P1` **Contradiction & Synthesis Analysis**:
  - Backend must use LLM to cross-reference new sources with the existing Knowledge Graph.
  - Detect **contradictions** (new info clashing with old claims) and **redundancies**.
- `P1` **Review Modal & Diff UI**:
  - Implement a premium pop-out window (React/Next.js) for ingestion approval.
  - **GitHub-style Diff**: Show red/green line-level changes for existing entity pages being updated.
  - **Findings Summary**: Clear list of contradictions found, additional pages created, and edges modified.
  - **Action Controls**: `Approve All`, `Decline`, or `Edit Before Merge` buttons to finalize the compounding artifact.
- `P1` **Knowledge Activity Feed**:
  - A chronological "Knowledge Changelog" (Activity Feed) showing AI integrations, contradiction resolutions, and manual edits across the team.
- `P2` **Global Health Scan (Periodic Linter)**:
  - Background task to scan the entire wiki for "Stale Claims" (info superseded by newer documents) and flag them for review.

---

## 9) Advanced AI & Automation

- `P2` **AI Gap Analysis**:
  - Identify "Orphan Concepts"—topics mentioned frequently but lacking a dedicated wiki page—and suggest automated page creation.
- `P2` **Automated Template Matching**:
  - AI should automatically detect document types (e.g. "Meeting Notes", "SOP") during ingestion and apply relevant `PageTemplate` structures.

---

## Suggested Next Execution Order

1. Chat RAG core (`P0`)
2. Ingestion embeddings/Qdrant/progress (`P0/P1`)
3. Test + CI foundation (`P0`)
4. Export parity + reliability (`P1`)
5. Graph inference quality upgrades (`P1`)
6. Presence + UX polish (`P1/P2`)

