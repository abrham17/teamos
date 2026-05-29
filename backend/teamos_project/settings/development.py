import os

from .base import *

DEBUG = True
ALLOWED_HOSTS = [
    "api.team-os.tech",
    'team-os.tech',
    "https://teamos-w37k.vercel.app",
    ".onrender.com",
    "localhost",
    "127.0.0.1",
    "admin-dashboard.team-os.tech"
]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000", 
    "https://teamos-w37k.vercel.app",
    "https://api.team-os.tech",
    "https://team-os.tech",
    "https://teamos-2.onrender.com",
    "https://admin-dashboard.team-os.tech"
]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Override DB for local SQLite during early dev (swap to Postgres when ready)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# Override channel layer to in-memory for local dev without Redis
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

SIMPLE_JWT = {
    **SIMPLE_JWT,
    "AUTH_COOKIE_SECURE": False,
}

# Celery settings for local dev (no RabbitMQ/Redis required)
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Local testing: OpenRouter → DeepSeek V4 for chat + ingest LLM paths.
# Production uses OpenRouter (see production.py). Override with LLM_BACKEND=openai for OpenAI.
LLM_BACKEND = os.environ.get("LLM_BACKEND", "openrouter")

OPENAI_EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
_explicit_det = os.environ.get("USE_DETERMINISTIC_EMBEDDINGS")
if _explicit_det is not None and str(_explicit_det).strip() != "":
    USE_DETERMINISTIC_EMBEDDINGS = str(_explicit_det).lower() in ("1", "true", "yes")
else:
    # Free dev embeddings: deterministic vectors unless an OpenAI key is present.
    USE_DETERMINISTIC_EMBEDDINGS = not bool((OPENAI_API_KEY or "").strip())

# Tighter RAG budget in dev (override via env).
CHAT_RAG_MAX_CONTEXT_CHARS = int(os.environ.get("CHAT_RAG_MAX_CONTEXT_CHARS", "20000"))
CHAT_RAG_RESULT_LIMIT = int(os.environ.get("CHAT_RAG_RESULT_LIMIT", "10"))

