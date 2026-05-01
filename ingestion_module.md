# TeamOS — Ingestion Module

**Status:** Partial  
**Capability refs:** `ING-001`, `ING-002`, `ING-003`, `ING-004` in `docs/capability-matrix.md`

## Current behavior

- URL and file ingestion job creation are implemented via `backend/ingest/views.py`.
- Ingest jobs are asynchronous through Celery task execution.
- Job history endpoint is available for recent ingest jobs.
- Vector/chunk pipeline foundation exists, but full productized stage telemetry and advanced governance/review UX are not fully closed.

## Target behavior

- Full source coverage (URL/PDF/DOCX/repository) with predictable extraction quality.
- Stage-by-stage progress and observability wired end-to-end for users and operators.
- Governance flow for review/approval with clear diff and merge outcomes.
- Strong grounding and merge semantics for updating existing wiki knowledge, not only creating new artifacts.

The Ingestion Module is the gateway through which external information enters the TeamOS Knowledge Base. It transforms raw data (URLs, Documents, Repositories) into structured, interlinked, and searchable "WikiPages."

---

## 1. Overview & Core Purpose

The primary goal of the Ingestion Module is to solve the "cold start" and "maintenance" problems of wikis. Instead of manually writing documentation, teams can ingest their existing sources (Slack threads, project reports, codebases, research papers), which the AI then "compiles" into a compounding knowledge artifact.

### Key Use Scenarios
*   **Onboarding**: Point the ingestor at a GitHub repository to automatically generate a "Project Map" wiki page.
*   **Research**: Ingest 50+ research papers (PDFs) to create a structured synthesis of a new domain.
*   **Knowledge Consolidation**: Convert a messy collection of Google Docs and URLs into a clean, interlinked wiki with backlink support.

---

## 2. Ingestion Flow (How it works)

The pipeline is managed by **Celery** as an asynchronous workflow to handle large files and repositories without blocking the UI.

### Step 1: Extraction
*   **URL Ingestion**: Fetches HTML, cleans boilerplates (scripts/styles), and extracts core text.
*   **File Ingestion (PDF/DOCX)**: (Powered by `unstructured`) Extracts structured narrative text while preserving sections.
*   **Repository Ingestion**: Clones the repo to a temporary workspace, filters for code/doc extensions, and aggregates content into a "Project Map" context.

### Step 2: Governance (The Gate)
*   **Auto-Approve ON**: Data flows directly into the wiki.
*   **Auto-Approve OFF**: The system extracts the "Raw Data" but halts for human review. It identifies potential contradictions with the existing wiki and presents them in a **Diff UI** (GitHub-style) for approval.

### Step 3: Materialization
*   **WikiPage Creation**: A new page is created with a generated title and slug.
*   **Raw Grounding**: The full original source is saved in `raw_content`. This allows for **Exact Citations**—links in the wiki that point back to the exact paragraph in the original source.

### Step 4: Semantic Chunking
*   **Sliding Window**: Content is split into chunks (e.g. 512 tokens with 64-token overlap).
*   **Plan-Aware**: The chunk size and strategy adjust automatically based on the Team's plan (Free vs. Pro).

### Step 5: Vectorization & Sync
*   **Embeddings**: Generates vectors using OpenAI's `text-embedding-3` models (with local mock fallbacks for dev).
*   **Qdrant Sync**: Chunks are pushed to a per-team Qdrant collection, enabling instant RAG-powered search.

### Step 6: Graph Wiring
*   **Wikilinks**: Parses `[[wikilinks]]` to create manual edges.
*   **AI Inference**: Suggests links to other pages based on semantic similarity.

---

## 3. How to Use

### Via API (REST)
`POST /api/ingest/:team_id/jobs/`
```json
{
  "source_type": "url",
  "source_url": "https://example.com/docs",
  "auto_approve": false
}
```

### Via UI
1.  Navigate to the **Ingest** panel.
2.  Choose your source type (URL, Upload, or Repo).
3.  Click "Start Ingest."
4.  Monitor progress via the SSE events.
5.  If "Auto-Approve" was off, review the proposed changes in the **Review Modal** and click "Accept Merge."

---

## 4. Implementation Details

*   **Models**: `IngestJob` (tracks state), `WikiPage` (the artifact), `PageChunk` (the searchable unit).
*   **Storage**: PostgreSQL (Metadata), Qdrant (Vectors), S3/Supabase (Raw Files).
*   **Logic**: Located in `backend/ingest/pipeline.py` and `backend/ingest/vectors.py`.

### Code Reference
*   [Ingest Pipeline](file:///home/abrhame/projects/mem2/teamos/backend/ingest/pipeline.py) — The main orchestrator.
*   [Vector Store](file:///home/abrhame/projects/mem2/teamos/backend/ingest/vectors.py) — Qdrant/OpenAI integration.
*   [Ingest Models](file:///home/abrhame/projects/mem2/teamos/backend/ingest/models.py) — The data schema.

---

## 5. Future Roadmap
*   **Multi-Modal**: Support for parsing images and charts from sources.
*   **Incremental Merge**: Instead of creating a new page, the AI will proactively edit 10-15 existing pages to integrate new data.
