# Local development and Docker runbook

This document describes how to run TeamOS locally (SQLite or Postgres), with Redis, Celery, Qdrant, and the ASGI server (Daphne).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DJANGO_SETTINGS_MODULE` | `teamos_project.settings.development` (default in `manage.py`) or `teamos_project.settings.production` |
| `LLM_BACKEND` | `groq` in development (default), `openai` for production-style chat/agent |
| `GROQ_API_KEY` | Required for chat when `LLM_BACKEND=groq` |
| `OPENAI_API_KEY` | OpenAI chat when `LLM_BACKEND=openai`; embeddings when not using deterministic mocks |
| `USE_DETERMINISTIC_EMBEDDINGS` | Override dev default: `1`/`true` forces hash-based vectors (no embedding API spend) |
| `OPENAI_EMBEDDING_MODEL` | Embedding model name when using OpenAI embeddings (default `text-embedding-3-small`) |
| `REDIS_URL` | Celery broker and Channels (`redis://host:6379/0`) |
| `QDRANT_URL` | Vector DB (e.g. `http://localhost:6333` or `http://qdrant:6333` in Compose) |
| `DATABASE_URL` | Postgres URL in Docker/production; development uses SQLite unless overridden |
| `CHAT_RAG_MAX_CONTEXT_CHARS` | Max characters of assembled wiki context for chat RAG |
| `CHAT_RAG_RESULT_LIMIT` | Max vector hits merged into context before truncation |

### Development defaults (`teamos_project.settings.development`)

- **Chat:** Groq (`LLM_BACKEND` defaults to `groq`) via `GROQ_API_KEY`.
- **Embeddings:** If `OPENAI_API_KEY` is **unset**, `USE_DETERMINISTIC_EMBEDDINGS` defaults to **true** (deterministic local vectors, no OpenAI embedding spend). Set an OpenAI key to use real embeddings locally.
- **Wiki agent (tool calling):** Requires `LLM_BACKEND=openai` and OpenAI. With Groq-only dev, **Ask** mode works; **Agent** mode is unavailable until you switch backend or add Groq tool support.
- **Channels:** In-memory channel layer (no Redis required for WebSockets in default dev settings).
- **Celery:** `CELERY_TASK_ALWAYS_EAGER=True` — ingest and graph tasks run **in-process** when queued. The Docker `worker` service is for setups that disable eager mode and want a real Celery process.

### Production (`teamos_project.settings.production`)

- `LLM_BACKEND` is forced to **`openai`** unless `ALLOW_NON_OPENAI_LLM_IN_PRODUCTION=1` (escape hatch).
- `USE_DETERMINISTIC_EMBEDDINGS` is **false** — expect real embeddings from OpenAI.
- `QDRANT_URL` must be set; startup logs a critical message if missing.
- Larger defaults for `CHAT_RAG_MAX_CONTEXT_CHARS` and `CHAT_RAG_RESULT_LIMIT` than development.

## SQLite vs Postgres

- **Default development settings** use SQLite at `backend/db.sqlite3` (see `settings/development.py`).
- **Docker Compose** sets `DATABASE_URL` to Postgres (`db` service). Point `DJANGO_SETTINGS_MODULE` at a module that uses Postgres when running in Compose (or align `development.py` with a Postgres URL if you switch).

## Docker Compose

From the repository root:

```bash
docker compose up --build
```

Services (see `docker-compose.yml`):

- **db** — Postgres 15
- **redis** — Redis 7
- **qdrant** — Qdrant vector store (dashboard: `http://localhost:6333/dashboard`)
- **backend** — Daphne ASGI on port `8000`
- **worker** — Celery worker (same image as backend)
- **frontend** — Next.js on port `3000`

Healthchecks gate `backend` on `db`, `redis`, and `qdrant`.

Set `OPENAI_API_KEY` (and optionally `GROQ_API_KEY`) in your shell or `.env` for Compose variable substitution.

## Local without full Docker

1. **Python env:** Prefer the virtualenv at the **repository root** (`teamos/venv/`). Create it with `python3 -m venv venv` from the repo root, then:  
   `venv/bin/pip install -r backend/requirements.txt`  
   `venv/bin/python backend/manage.py migrate`
2. **Redis** (if you use non-eager Celery or production-style Channels): `redis-server` or `docker run -p 6379:6379 redis:7-alpine`
3. **Qdrant:** `docker compose up -d qdrant` or run the Qdrant binary; set `QDRANT_URL=http://localhost:6333`
4. **Migrations:** `python manage.py migrate`
5. **Superuser (optional):** `python manage.py createsuperuser`
6. **API server:** `daphne -b 127.0.0.1 -p 8000 teamos_project.asgi:application` (WebSockets) or `python manage.py runserver` for quick HTTP-only checks
7. **Celery worker** (when not eager): `celery -A teamos_project worker --loglevel=info`

### Testing with a real Celery worker

In `development.py`, `CELERY_TASK_ALWAYS_EAGER` is **True**. To exercise the worker process, set `CELERY_TASK_ALWAYS_EAGER=False` (and ensure `REDIS_URL` plus a running worker) in a custom settings module or local override—document any such module name in your team’s internal notes.

## Smoke checks

- `python manage.py check`
- Hit `GET /api/health/` or your deployment’s health endpoint if configured
- Create a team, ingest a wiki page, run chat **Ask** with `GROQ_API_KEY` and Qdrant running

## Qdrant note

Development normally uses **self-hosted** Qdrant (local or Compose). Production uses **managed** Qdrant via `QDRANT_URL` / `QDRANT_API_KEY`. The application code path is the same; only the deployment target changes.

## See also

- [PRODUCTION_DEV_ONLY_STRIPPING.md](PRODUCTION_DEV_ONLY_STRIPPING.md) — Groq, deterministic embeddings, and other dev-only paths: how they are disabled in production and what to reindex or remove from secrets.
- [INGEST_OSS.md](INGEST_OSS.md) — OSS ingestion extractors (PDF, DOCX, YouTube captions, image OCR, zip), limits, and excluded paid modalities.
