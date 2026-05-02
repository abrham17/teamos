import os

from .base import *

DEBUG = True
ALLOWED_HOSTS = ["*"]
CSRF_TRUSTED_ORIGINS = ["http://localhost:3000"]
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

# Local testing: Groq OpenAI-compatible API for chat + ingest LLM paths.
# Production uses OpenAI only (see production.py). Override with LLM_BACKEND=openai if needed.
LLM_BACKEND = os.environ.get("LLM_BACKEND", "groq")

