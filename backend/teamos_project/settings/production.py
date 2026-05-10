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
    "teamos-w37k.vercel.app",
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
        conn_max_age=0,
        conn_health_checks=True,
    )
}

# Redis for Channels / Celery (Upstash or native)
REDIS_URL = os.environ.get("REDIS_URL", "")

# Heroku Redis SSL compatibility
import ssl

redis_ssl_options = {
    "CLIENT_CLASS": "django_redis.client.DefaultClient",
    "CONNECTION_POOL_KWARGS": {
        "ssl_cert_reqs": ssl.CERT_NONE,
        "ssl_check_hostname": False,
    }
}

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": redis_ssl_options,
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [{
                "address": REDIS_URL,
                "ssl_cert_reqs": "none",
                "ssl_check_hostname": False,
            }],
        },
    },
}

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL

if REDIS_URL.startswith("rediss://"):
    CELERY_REDIS_BACKEND_USE_SSL = {
        "ssl_cert_reqs": "none",
        "ssl_check_hostname": False,
    }
    CELERY_BROKER_USE_SSL = {
        "ssl_cert_reqs": "none",
        "ssl_check_hostname": False,
    }

# Security
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_DOMAIN = ".team-os.tech"
CSRF_COOKIE_DOMAIN = ".team-os.tech"
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True

CSRF_TRUSTED_ORIGINS = [
    "https://team-os.tech",
    "https://api.team-os.tech",
    "https://teamos-2.onrender.com",
    "https://teamos-w37k.vercel.app",
    "https://team-os-dev.onrender.com",
]
# Allow env var to override if needed
extra_origins = os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
CSRF_TRUSTED_ORIGINS += [o.strip() for o in extra_origins if o.strip()]

# Static Files & Media (Optimized with Whitenoise & Appwrite)
STORAGES = {
    "default": {
        "BACKEND": "teamos_project.storage.AppwriteMediaStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# CORS
from corsheaders.defaults import default_headers


CORS_ALLOWED_ORIGINS = [
    "https://team-os.tech",
    "https://teamos-2.onrender.com",
    "https://teamos-w37k.vercel.app",
    "https://team-os-dev.onrender.com",
]
CORS_ALLOW_HEADERS = list(default_headers) + [
    "authorization",
    "content-type",
    "x-clerk-auth-token",
]

CORS_EXPOSE_HEADERS = ["content-type", "authorization"]

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

# CSRF already configured above

# Simple JWT Cookie Security
SIMPLE_JWT["AUTH_COOKIE_DOMAIN"] = ".team-os.tech"
SIMPLE_JWT["AUTH_COOKIE_SECURE"] = True
SIMPLE_JWT["AUTH_COOKIE_SAMESITE"] = "Lax"

# Groq / OpenAI / OpenRouter API Keys
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
OPENROUTER_API_BASE = "https://openrouter.ai/api/v1"

# Production: force OpenAI or OpenRouter for LLM and Embeddings
LLM_BACKEND = os.environ.get("LLM_BACKEND", "openai")
OPENAI_CHAT_MODEL = "gpt-4o"
OPENAI_MINI_MODEL = "gpt-4o-mini"
OPENAI_NANO_MODEL = "gpt-4.1-nano"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS = 1536
USE_DETERMINISTIC_EMBEDDINGS = False

# Larger assembled RAG context for production (override via env).
CHAT_RAG_MAX_CONTEXT_CHARS = int(os.environ.get("CHAT_RAG_MAX_CONTEXT_CHARS", "100000"))
CHAT_RAG_RESULT_LIMIT = int(os.environ.get("CHAT_RAG_RESULT_LIMIT", "30"))

# RAG logic uses PGVector natively through models.

# --- Email Settings ---
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("SMTP_HOST")
_EMAIL_PORT = int(os.environ.get("SMTP_PORT", 587))
EMAIL_PORT = _EMAIL_PORT
EMAIL_USE_TLS = (_EMAIL_PORT == 587)
EMAIL_USE_SSL = (_EMAIL_PORT == 465)
EMAIL_HOST_USER = os.environ.get("SMTP_USER")
EMAIL_HOST_PASSWORD = os.environ.get("SMTP_PASSWORD")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "TeamOS <hello@team-os.tech>")
