# TeamOS Ingestion Phase 2 — Detailed Implementation Plan

This plan defines the full ingestion implementation for `backend/ingest/tasks.py` Phase 2, including job execution, parsing, chunking, wiki materialization, dedup behavior, and graph wiring.

---

## Goals

- Convert ingest jobs from placeholder behavior to executable pipeline.
- Support async ingestion for URL and file uploads.
- Create/update TeamOS wiki pages from ingest inputs.
- Generate page chunks with deterministic hashing and chunk indexing.
- Re-wire graph links after ingest completion.
- Return deterministic job states for frontend polling (`pending` → `running` → `done` / `failed`).

---

## Current State (Before Implementation)

- `run_ingest_job` references `ingest.pipeline.run_pipeline`, but no `pipeline.py` exists.
- Ingest API creates jobs but does not trigger Celery.
- File uploads are not persisted for async processing.
- No parser/chunker implementation is connected to `WikiPage`/`PageChunk`.

---

## Planned Architecture

## 1) Pipeline entry

- Keep Celery task entrypoint in `ingest/tasks.py`:
  - `run_ingest_job(job_id, source_text="")`
- Task responsibilities:
  - fetch job
  - mark status running
  - call `run_pipeline(job, source_text=...)`
  - set `done`/`failed` with error handling

## 2) New pipeline module

- Add `backend/ingest/pipeline.py` with:
  - source extraction functions
  - page title/slug derivation
  - chunking strategy by plan tier
  - chunk hash generation
  - chunk persistence
  - graph rewire trigger

## 3) Source extraction

- URL jobs:
  - fetch HTML via `requests`
  - convert to text with basic HTML tag/script/style stripping
- File jobs:
  - use `source_text` passed from view (decoded at upload time)
  - fail clearly if empty/unsupported

## 4) Wiki materialization

- Create a `WikiPage` if not already linked to job.
- Page fields:
  - `title` derived from source (URL host/path or filename)
  - unique `slug` per team
  - `content` from extracted text
  - `source_url` and `raw_file_url` where applicable
  - `created_by` from job creator

## 5) Chunking and dedup behavior

- Resolve team plan from `job.team.plan`.
- Use `settings.PLAN_TIERS` for:
  - `chunk_size`
  - `chunk_overlap`
- Chunking strategy:
  - deterministic token-ish text windows (word-based)
  - overlap windows for context continuity
- Hash each chunk content with SHA-256.
- Persistence:
  - clear prior chunks for that page, then insert fresh indexed chunks
  - store `content_hash` and synthetic `qdrant_point_id` placeholder
  - update `job.chunk_count`

## 6) Graph integration

- After page/chunks persist:
  - trigger `wire_page_graph.delay(page_id)` for wikilink edges.

## 7) API behavior changes

- `UrlIngestView.post`:
  - create job
  - enqueue `run_ingest_job.delay(job_id)`
- `FileIngestView.post`:
  - decode upload text in request process
  - create job with inferred type (`markdown`, `pdf`, `docx`)
  - enqueue `run_ingest_job.delay(job_id, source_text)`

---

## Status & Failure Semantics

- `pending`: job created.
- `running`: task started.
- `done`: pipeline completed; page/chunks created.
- `failed`: terminal error; store message in `job.error`.

Failure examples:
- URL fetch timeout/4xx/5xx
- empty source content
- upload decode failure

---

## Rollout Steps

1. Add `ingest/pipeline.py`.
2. Update `ingest/tasks.py` to call real pipeline and status transitions.
3. Update `ingest/views.py` to enqueue jobs.
4. Keep serializer/model schema unchanged (no migration required for this phase).
5. Run backend checks.
6. Smoke test:
   - URL job creates page + chunks.
   - File job creates page + chunks.
   - Invalid input marks failed.

---

## Notes / Constraints

- This phase uses a robust local chunk persistence path and graph wiring.
- True PDF/DOCX structural parsing and real Qdrant writes can be layered later.
- Current implementation will be reliable and deterministic with existing dependencies.

