from .base import *
import logging
import os

import dj_database_url

from teamos_project.llm_env import production_llm_backend_from_env

logger = logging.getLogger(__name__)

DEBUG = False

# Read from env
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")

# DB Setup (Supabase PostgreSQL usually provides a connection URL)
DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL"),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# Redis for Channels / Celery (Upstash or native)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL"),
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [os.environ.get("REDIS_URL")],
        },
    },
}

CELERY_BROKER_URL = os.environ.get("REDIS_URL")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL")

# Security
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# CORS
CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
CORS_ALLOW_CREDENTIALS = True

# Simple JWT
SIMPLE_JWT["AUTH_COOKIE_SECURE"] = True

# Qdrant setup
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")

# Groq / OpenAI API Keys
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
# Production: force OpenAI for LLM unless ALLOW_NON_OPENAI_LLM_IN_PRODUCTION=1.
LLM_BACKEND = production_llm_backend_from_env(os.environ)
USE_DETERMINISTIC_EMBEDDINGS = False

# Larger assembled RAG context for production (override via env).
CHAT_RAG_MAX_CONTEXT_CHARS = int(os.environ.get("CHAT_RAG_MAX_CONTEXT_CHARS", "100000"))
CHAT_RAG_RESULT_LIMIT = int(os.environ.get("CHAT_RAG_RESULT_LIMIT", "30"))

if not QDRANT_URL:
    logger.critical("QDRANT_URL is not set; vector search and ingest will fail until configured.")
