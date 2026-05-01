# TeamOS Graph Phase 2 — Detailed Plan

This document defines the Phase 2 implementation for TeamOS graph backend (and frontend compatibility), moving from basic graph endpoints to analytics-aware, cache-backed graph intelligence.

---

## Objectives

- Add graph analytics beyond raw node/edge listing:
  - PageRank-style hub scoring
  - community/cluster detection
  - orphan detection
- Add AI-inferred edge generation to complement wikilinks/manual edges.
- Cache analytics to avoid recomputation on each request.
- Invalidate cache safely whenever graph topology changes.
- Keep current frontend compatible while exposing richer metadata.

---

## Current Gaps

- `GraphHubsView` is in-degree only (not PageRank-like).
- No community clustering output.
- Orphan calculation re-runs without cache.
- No AI-inferred edge generation task.
- No graph analytics endpoint for consolidated stats.

---

## Phase 2 Scope

## 1) Analytics service module

Add a new `graph_engine/analytics.py` module with:

- `compute_team_graph_analytics(team_id)`:
  - gather pages and edges (team-scoped)
  - run iterative PageRank approximation
  - run connected-component clustering (weak/undirected)
  - compute orphan ids/list
  - return analytics payload
- `get_team_graph_analytics(team_id, force=False)`:
  - cache fetch (TTL 1 hour)
  - recompute if missing/forced
- `invalidate_team_graph_analytics_cache(team_id)`:
  - remove cached analytics when graph changes

## 2) API enrichment

- Update `GraphView` to include analytics metadata in each node:
  - `page_rank`
  - `cluster_id`
- Keep existing response shape fully backward-compatible.
- Add `GraphAnalyticsView` endpoint:
  - `GET /api/graph/<team_id>/analytics/`
  - returns hubs, clusters summary, orphan summary, and score map.

## 3) Improved hubs/orphans endpoints

- `GraphHubsView` and `GraphOrphansView` should use cached analytics instead of recomputing each request.

## 4) AI-inferred edges task

In `ingest/tasks.py`:

- Add `infer_ai_edges(page_id)` task:
  - compare page text tokens with same-team pages
  - score overlap-based confidence
  - create top inferred edges (`edge_type="ai_inferred"`, `created_by="pipeline"`)
  - replace stale inferred edges for that source page each run
- Trigger from `wire_page_graph` after wikilink updates.

## 5) Cache invalidation wiring

Invalidate analytics cache when topology changes:

- after `wire_page_graph`
- after `infer_ai_edges`
- after manual edge create/delete in `GraphEdgeCreateView`

## 6) Frontend analytics consumption

- Fetch analytics in parallel with graph payload:
  - `GET /api/graph/<team_id>/analytics/`
- Surface Phase 2 insights in graph UI:
  - cluster count
  - orphan warning banner
  - top-hub summary (top 3 with score)
- Keep viewer backward-compatible:
  - existing graph visualization remains primary
  - analytics are additive overlays only

---

## Performance Targets

- Analytics API should be cache-backed for repeated page loads.
- Recompute cost acceptable for medium teams (hundreds of pages).
- Invalidation keeps cache fresh after mutations.

---

## Risk & Safeguards

- **Risk:** heavy analytics for large teams.
  - safeguard: cache + bounded iterations for PageRank.
- **Risk:** noisy inferred edges.
  - safeguard: confidence threshold + top-k cap + replace stale inferred edges.
- **Risk:** frontend breakage.
  - safeguard: response remains backward-compatible (only additive fields).

---

## Validation Plan

- Django `check` passes.
- Python syntax checks pass.
- Manual smoke:
  - create wiki links, confirm graph updates.
  - create manual edge, confirm analytics cache invalidates.
  - call `/analytics`, verify hubs/orphans/clusters payload.
  - update page text and confirm inferred edges refresh.

---

## Implementation Status

- [x] Analytics service with cache (`graph_engine/analytics.py`)
- [x] PageRank-like scoring + cluster/orphan computation
- [x] Analytics endpoint (`/api/graph/<team_id>/analytics/`)
- [x] Cached hubs/orphans endpoints
- [x] AI-inferred edge background task (`infer_ai_edges`)
- [x] Cache invalidation on graph mutation paths
- [x] Frontend graph page analytics overlay consumption

