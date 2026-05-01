# TeamOS — Interlinked Wiki System

**Status:** Partial  
**Capability refs:** `WIKI-001`, `WIKI-002`, `WIKI-003`, `WIKI-004` in `docs/capability-matrix.md`

## Current behavior

- Wiki CRUD and autosave workspace are implemented and usable.
- TipTap editor with wikilink authoring support is integrated.
- Backlinks/unlinked endpoints exist and are exposed from backend wiki APIs.
- Some advanced wiki promises (full frontmatter parity, deep editor navigation polish, full CRDT collaboration completeness) are still partial.

## Target behavior

- Feature-complete interlinked authoring loop with robust frontmatter workflows.
- Deterministic deep-link navigation to exact sections from citations and graph/chat contexts.
- Production-grade real-time collaboration and presence consistency.
- Consistent documentation claims aligned with shipped editor and wiki behaviors.

The Interlinked Wiki System is the core of TeamOS. It transforms flat markdown files into a multi-dimensional knowledge graph where every page is a node and every citation is a living connection.

---

## 1. The Editor (TipTap Powered)

TeamOS uses a custom-built editor based on **TipTap** (ProseMirror), specifically designed for knowledge management.

### Key Editor Features:
*   **Slash Commands (`/`)**: Instantly insert Headings, Tables, Code Blocks, or Callouts.
*   **WikiLinks (`[[`)**: Fuzzy-search your team's pages to create a dynamic chip.
*   **Markdown Native**: Bi-directional support for Markdown. You edit in a rich interface, but it saves as standard Markdown in the backend.
*   **Actionable Citations**: Click any link or citation chip to navigate. In editor mode, this allows for **Deep Navigation**—jumping between page editors instantly.

---

## 2. The Knowledge Graph Strategy

Every time a page is saved, TeamOS performs a **"Graph Re-wire"**:
1.  **Extract Links**: The backend parses all `[[Page Title]]` patterns.
2.  **Update Edges**: It creates `wikilink` edges in the `GraphEdge` table.
3.  **Backlinks Panel**: On each page, a sidebar shows every other page that links *to* the current one, providing automated context.

---

## 3. Real-time Co-editing (CRDT)

TeamOS implements **Yjs** for conflict-free replicated data types.
*   **Simultaneous Editing**: Multiple team members can edit the same page without overwriting each other.
*   **Presence**: See where your teammates are with colored cursors and avatar dots.
*   **Collaborative Graph**: Even structural changes (like renaming a page) are propagated to ensure no broken links.

---

## 4. Advanced Logic: LM Wiki Features

The Wiki System is deeply integrated with the AI layer:
*   **Incremental Integration**: Instead of the AI just dumping text, it "merges" new information into your existing pages.
*   **Contradiction Resolution**: The system flags clashing information between pages for human review.
*   **Dynamic Dashboards**: Use live-query blocks to render parts of your knowledge graph directly in a page (e.g., "Active Tasks across all projects").

---

## 5. Technical Architecture

*   **Frontend**: Next.js 15, TipTap, Zustand (State), Yjs (Sync).
*   **Backend**: Django, PostgreSQL, Qdrant (Vector Search).
*   **Protocol**: WebSockets (Channels) for presence and Yjs synchronization.

### Code Reference
*   [GoogleDocsEditor](file:///home/abrhame/projects/mem2/teamos/frontend/src/components/editor/GoogleDocsEditor.tsx) — The main editor component.
*   [Wiki Models](file:///home/abrhame/projects/mem2/teamos/backend/wiki/models.py) — The storage schema.
*   [Graph Engine](file:///home/abrhame/projects/mem2/teamos/backend/graph_engine/models.py) — Relationship tracking.
