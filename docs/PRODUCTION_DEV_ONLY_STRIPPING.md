# Production: dev-only behavior and how to turn it off

This document lists **development-oriented** code paths, settings, and credentials. In production you normally **do not delete** this code; you **disable** it by using `teamos_project.settings.production` and the correct environment variables. Optional **code removal** is noted where it would be a deliberate product decision.

## 1. Use production settings (required)

| Step | Action |
|------|--------|
| 1 | Set `DJANGO_SETTINGS_MODULE=teamos_project.settings.production` (ASGI/WSGI, Celery worker, release pipeline). |
| 2 | Never deploy with `teamos_project.settings.development` in production. |

`development.py` is where most dev-only defaults live (SQLite, in-memory Channels, eager Celery, Groq default, deterministic embeddings auto-on without an OpenAI key). Production overrides the critical LLM/embedding flags (see below).

## 2. LLM backend: Groq vs Openai

| What | Where | Dev purpose | Production |
|------|--------|-------------|------------|
| Default `LLM_BACKEND=groq` | [`backend/teamos_project/settings/development.py`](backend/teamos_project/settings/development.py) | Cheap local chat via Groq OpenAI-compatible API | **Not used** when production settings load. |
| Groq client wiring | [`backend/ingest/vectors.py`](backend/ingest/vectors.py) (`VectorStore.__init__`), [`backend/teamos_project/llm_config.py`](backend/teamos_project/llm_config.py) (`chat_completion_model`) | Chat completions when `LLM_BACKEND=groq` | Inactive if `LLM_BACKEND=openai` (production default). |
| Forced OpenAI in prod | [`backend/teamos_project/settings/production.py`](backend/teamos_project/settings/production.py) via [`backend/teamos_project/llm_env.py`](backend/teamos_project/llm_env.py) | — | `LLM_BACKEND` resolves to **`openai`** unless `ALLOW_NON_OPENAI_LLM_IN_PRODUCTION=1`. |

**Steps for production (configuration, not code removal):**

1. Do **not** set `ALLOW_NON_OPENAI_LLM_IN_PRODUCTION` in production unless you explicitly intend non-OpenAI chat.
2. Set `OPENAI_API_KEY` for chat, ingest LLM paths that use OpenAI, embeddings, TTS, and wiki **agent** tool calling.
3. `GROQ_API_KEY` is optional in production; you can omit it from prod secrets to avoid accidental Groq use if someone flips the escape hatch.

**Optional code removal (not required for a safe deploy):** Removing Groq branches entirely would shrink the codebase but breaks local dev unless you refactor behind plugins. Most teams keep the code and rely on settings.

## 3. Deterministic (“mock”) embeddings

| What | Where | Dev purpose | Production |
|------|--------|-------------|------------|
| `VectorStore._mock_embedding()` | [`backend/ingest/vectors.py`](backend/ingest/vectors.py) | Hash-based unit vectors when `USE_DETERMINISTIC_EMBEDDINGS` is true or when OpenAI embedding calls fail | **Disabled in production settings:** `USE_DETERMINISTIC_EMBEDDINGS = False` in [`production.py`](backend/teamos_project/settings/production.py). |
| Dev auto-on without OpenAI key | [`backend/teamos_project/settings/development.py`](backend/teamos_project/settings/development.py) | No embedding API spend locally | N/A in production module. |

**Steps for production:**

1. Ensure **`USE_DETERMINISTIC_EMBEDDINGS` is not set to true** in production env (production module forces `False` anyway).
2. Set **`OPENAI_API_KEY`** so real embeddings are used for ingest and RAG.
3. **Re-embed / reindex** wiki content if a collection was ever built with deterministic vectors and you need production-quality semantic search: vectors from mocks are not semantically comparable to `text-embedding-3-small` (even when dimension matches). Recreate or clear the per-team Qdrant collection and run your normal reindex pipeline.

**Optional code removal:** You could delete `_mock_embedding` and fallbacks only if you commit to **never** running without an embedding provider (CI, offline dev would break). Keeping the fallback is the usual choice.

## 4. Other development-only settings (not “Groq”, but must not ship as dev defaults)

| Area | Development | Production expectation |
|------|-------------|------------------------|
| Database | SQLite in `development.py` | `DATABASE_URL` / Postgres in `production.py` |
| `DEBUG` | `True` | `False` |
| `ALLOWED_HOSTS` | `["*"]` | Explicit hosts from env |
| `CORS_ALLOW_ALL_ORIGINS` | `True` | `CORS_ALLOWED_ORIGINS` from env |
| Channels | `InMemoryChannelLayer` | Redis `CHANNEL_LAYERS` |
| Celery | `CELERY_TASK_ALWAYS_EAGER=True` | Real broker/worker with eager off |
| JWT cookie | `AUTH_COOKIE_SECURE=False` | `True` |

**Steps:** Align all of the above by deploying with `production` settings and env vars from [`backend/.env.production.example`](backend/.env.production.example).

## 5. Plan tier metadata (`PLAN_TIERS`)

[`backend/teamos_project/settings/base.py`](backend/teamos_project/settings/base.py) includes labels such as `chat_provider: "groq"` for some tiers. That is **metadata** for product/ingest documentation; runtime chat still follows `LLM_BACKEND` and `chat_completion_model()`.

**Production:** No code removal required unless you want marketing/docs-only strings updated. Ensure **operational** keys and `LLM_BACKEND` match your real provider.

## 6. Docker Compose and secrets

Local [`docker-compose.yml`](docker-compose.yml) may pass `OPENAI_API_KEY` and omit production-only constraints.

**Steps for production:**

1. Use your orchestrator’s secrets (not committed `.env` with dev keys).
2. Remove or restrict any **development** API keys from production secret stores if policy requires (e.g. separate Groq key only in CI/dev vaults).

## 7. Quick verification checklist before go-live

- [ ] `DJANGO_SETTINGS_MODULE` points at **`settings.production`**.
- [ ] `OPENAI_API_KEY` set; chat and embeddings smoke-tested.
- [ ] `QDRANT_URL` (and API key if used) set; no reliance on `localhost:6333` from prod pods unless intentional.
- [ ] `USE_DETERMINISTIC_EMBEDDINGS` not enabled in env (redundant with production.py but avoids confusion).
- [ ] `ALLOW_NON_OPENAI_LLM_IN_PRODUCTION` **unset** unless deliberately using a non-OpenAI LLM in prod.
- [ ] Redis, Postgres, and Celery workers match production architecture (no eager, no in-memory Channels).
- [ ] If migrating from a dev Qdrant filled with mock embeddings, plan **reindex** after switching to real embeddings.

## Related docs

- [LOCAL_AND_DOCKER.md](LOCAL_AND_DOCKER.md) — how to run the stack and env variable reference.
