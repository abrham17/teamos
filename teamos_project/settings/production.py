from .base import *
import logging
import os

import dj_database_url

from teamos_project.llm_env import production_llm_backend_from_env

logger = logging.getLogger(__name__)


# Read from env (fallback to dummy for build phase)
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "build-placeholder-only-change-in-render")

# ALLOWED_HOSTS should include the main domain and Render's domain pattern.
raw_allowed_hosts = os.environ.get("DJANGO_ALLOWED_HOSTS", "api.team-os.tech,team-os.tech")
ALLOWED_HOSTS = [host.strip() for host in raw_allowed_hosts.split(",") if host.strip()]
ALLOWED_HOSTS += [
    "localhost",
    "team-os.tech",
    "api.team-os.tech",
    "127.0.0.1",
    "teamos-2.onrender.com",
    "team-os-dev.onrender.com",
    ".onrender.com", # Wildcard for any render subdomain
]

# Render (and most load balancers) terminates SSL and passes it via X-Forwarded-Proto
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# DB Setup (Supabase PostgreSQL usually provides a connection URL)
database_url = os.environ.get("DATABASE_URL")
if database_url and ":[" in database_url and "]@" in database_url:
    # Fix for common Supabase copy-paste error where brackets are left around the password
    database_url = database_url.replace(":[", ":").replace("]@", "@")

DATABASES = {
    "default": dj_database_url.config(
        default=database_url,
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

# CSRF
CSRF_TRUSTED_ORIGINS = os.environ.get(
    "CSRF_TRUSTED_ORIGINS", 
    "https://team-os.tech,https://api.team-os.tech,https://teamos-2.onrender.com"
).split(",")
CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in CSRF_TRUSTED_ORIGINS if origin.strip()]

# Static Files (Optimized with Whitenoise)
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# CORS
from corsheaders.defaults import default_headers


CORS_ALLOWED_ORIGINS = [
    "https://team-os.tech",
    "https://teamos-2.onrender.com",
    "https://team-os-dev.onrender.com",
]
CORS_ALLOW_HEADERS = list(default_headers) + [
    "authorization",
    "content-type",
    "x-clerk-auth-token",
]

CORS_EXPOSE_HEADERS = ["content-type", "authorization"]

CORS_ALLOW_CREDENTIALS = True

# CSRF already configured above

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
