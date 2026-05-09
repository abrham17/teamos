import os
from datetime import timedelta
from pathlib import Path
from celery.schedules import crontab
from dotenv import load_dotenv
from kombu import Exchange, Queue

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env_str(name: str, default: str = "") -> str:
    """
    Read env vars while normalizing accidental quoted-empty values.
    Example: CLERK_AUDIENCE="" should behave as empty.
    """
    value = os.environ.get(name, default)
    if value is None:
        return default
    cleaned = value.strip()
    if cleaned in {'""', "''"}:
        return ""
    return cleaned

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-change-me")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "channels",
    # TeamOS apps
    "accounts",
    "wiki",
    "graph_engine",
    "chat",
    "ingest",
    "export_app",
    "billing",
    "product_analytics",
    "presence",
    "planning",
    "llm_orchestrator",
    "admin_api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "llm_orchestrator.middleware.LlmUsageMiddleware",
]

ROOT_URLCONF = "teamos_project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

ASGI_APPLICATION = "teamos_project.asgi.application"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [os.environ.get("REDIS_URL", "redis://localhost:6379")]},
    }
}

# --- Database (override in dev/prod) ---
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "teamos"),
        "USER": os.environ.get("DB_USER", "postgres"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "accounts.User"

# --- REST Framework ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "accounts.authentication.ClerkJWTAuthentication",
        "accounts.authentication.CookieJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=7),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "AUTH_COOKIE": "access_token",
    "AUTH_COOKIE_HTTP_ONLY": True,
    "AUTH_COOKIE_SECURE": False,   # True in production
    "AUTH_COOKIE_SAMESITE": "Lax",
}

# --- Allauth ---
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
SITE_ID = 1
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
        "APP": {
            "client_id": os.environ.get("GOOGLE_CLIENT_ID") or os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""),
            "secret": os.environ.get("GOOGLE_CLIENT_SECRET") or os.environ.get("GOOGLE_OAUTH_SECRET", ""),
        },
    }
}

# --- CORS ---
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://teamos.vercel.app",
]

# --- Static & Media ---
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- Celery ---
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379")
CELERY_TASK_DEFAULT_QUEUE = "teamos.default"
CELERY_TASK_QUEUES = (
    Queue("teamos.default", Exchange("teamos"), routing_key="teamos.default"),
    Queue("teamos.critical", Exchange("teamos"), routing_key="teamos.critical"),
    Queue("teamos.dead_letter", Exchange("teamos"), routing_key="teamos.dead_letter"),
)
CELERY_TASK_ROUTES = {
    "accounts.tasks.send_team_invite_email": {"queue": "teamos.critical", "routing_key": "teamos.critical"},
    "accounts.tasks.purge_soft_deleted_team": {"queue": "teamos.critical", "routing_key": "teamos.critical"},
    "ingest.tasks.run_ingest_job": {"queue": "teamos.critical", "routing_key": "teamos.critical"},
    "ingest.tasks.wire_page_graph": {"queue": "teamos.default", "routing_key": "teamos.default"},
    "ingest.tasks.infer_ai_edges": {"queue": "teamos.default", "routing_key": "teamos.default"},
    "billing.tasks.reconcile_pending_billing_webhooks": {
        "queue": "teamos.critical",
        "routing_key": "teamos.critical",
    },
    "product_analytics.tasks.emit_product_event": {
        "queue": "teamos.default",
        "routing_key": "teamos.default",
    },
}
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_TASK_TRACK_STARTED = True
CELERY_BEAT_SCHEDULE = {
    "billing-reconcile-pending-webhooks": {
        "task": "billing.tasks.reconcile_pending_billing_webhooks",
        "schedule": crontab(minute="*/15"),
        "kwargs": {"batch_size": 50},
    },
}

# --- External APIs ---
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
# development.py sets LLM_BACKEND to "groq" for local testing; production.py sets "openai".
LLM_BACKEND = os.environ.get("LLM_BACKEND", "openai")
GROQ_API_BASE = os.environ.get("GROQ_API_BASE", "https://api.groq.com/openai/v1")
GROQ_CHAT_MODEL = os.environ.get("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
OPENAI_CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o")
OPENAI_EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
# When true, skip OpenAI embedding API and use deterministic local vectors (see ingest.vectors).
USE_DETERMINISTIC_EMBEDDINGS = os.environ.get("USE_DETERMINISTIC_EMBEDDINGS", "").lower() in (
    "1",
    "true",
    "yes",
)
# Optional override for Qdrant vector size (must match embedding model).
OPENAI_EMBEDDING_DIMENSIONS = os.environ.get("OPENAI_EMBEDDING_DIMENSIONS") or None
if OPENAI_EMBEDDING_DIMENSIONS is not None:
    try:
        OPENAI_EMBEDDING_DIMENSIONS = int(OPENAI_EMBEDDING_DIMENSIONS)
    except ValueError:
        OPENAI_EMBEDDING_DIMENSIONS = None
# Assembled wiki context for chat RAG (character budget; drop lowest-ranked chunks first).
CHAT_RAG_MAX_CONTEXT_CHARS = int(os.environ.get("CHAT_RAG_MAX_CONTEXT_CHARS", "20000"))
CHAT_RAG_RESULT_LIMIT = int(os.environ.get("CHAT_RAG_RESULT_LIMIT", "10"))
# Chat TTS (OpenAI audio/speech); requires OPENAI_API_KEY even when LLM_BACKEND=groq.
OPENAI_TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "tts-1")
OPENAI_TTS_DEFAULT_VOICE = os.environ.get("OPENAI_TTS_DEFAULT_VOICE", "alloy")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")

# --- Ingest extractors (OSS; limits overridable via env) ---
INGEST_MAX_URL_BYTES = int(os.environ.get("INGEST_MAX_URL_BYTES", str(5 * 1024 * 1024)))
INGEST_MAX_UPLOAD_BYTES = int(os.environ.get("INGEST_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
INGEST_MAX_REPO_OUTPUT_CHARS = int(os.environ.get("INGEST_MAX_REPO_OUTPUT_CHARS", str(2_000_000)))
INGEST_MAX_REPO_FILE_BYTES = int(os.environ.get("INGEST_MAX_REPO_FILE_BYTES", str(512 * 1024)))
INGEST_GIT_CLONE_TIMEOUT_SEC = int(os.environ.get("INGEST_GIT_CLONE_TIMEOUT_SEC", "120"))
INGEST_URL_FETCH_TIMEOUT_SEC = int(os.environ.get("INGEST_URL_FETCH_TIMEOUT_SEC", "25"))
INGEST_MAX_ZIP_MEMBERS = int(os.environ.get("INGEST_MAX_ZIP_MEMBERS", "5000"))
INGEST_MAX_ZIP_UNCOMPRESSED_BYTES = int(
    os.environ.get("INGEST_MAX_ZIP_UNCOMPRESSED_BYTES", str(20 * 1024 * 1024))
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@teamos.local")
CLERK_ISSUER = env_str("CLERK_ISSUER", "")
CLERK_JWKS_URL = env_str("CLERK_JWKS_URL", "")
CLERK_AUDIENCE = env_str("CLERK_AUDIENCE", "")
BILLING_PROVIDER = os.environ.get("BILLING_PROVIDER", "paddle")
BILLING_WEBHOOK_SECRET = os.environ.get("BILLING_WEBHOOK_SECRET", "")
PADDLE_WEBHOOK_SECRET = os.environ.get("PADDLE_WEBHOOK_SECRET", "")
PADDLE_WEBHOOK_TOLERANCE_SECONDS = int(os.environ.get("PADDLE_WEBHOOK_TOLERANCE_SECONDS", "300"))
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
TEAM_SOFT_DELETE_GRACE_HOURS = int(os.environ.get("TEAM_SOFT_DELETE_GRACE_HOURS", "24"))

# --- Plan Tiers ---
PLAN_TIERS = {
    "free": {
        "embed_model": "nomic-embed-text",
        "embed_provider": "local",
        "chunk_size": 4500,
        "chunk_overlap": 450,
        "chunking_strategy": "character",
        "retrieve_k": 5,
        "rerank_k": 3,
        "context_tokens": 2000,
        "chat_model": "llama-3.1-8b-instant",
        "chat_provider": "groq",
        "query_expansions": 0,
        "reranker": None,
    },
    "team": {
        "embed_model": "text-embedding-3-small",
        "embed_provider": "openai",
        "chunk_size": 4500,
        "chunk_overlap": 450,
        "chunking_strategy": "sentence",
        "retrieve_k": 20,
        "rerank_k": 8,
        "context_tokens": 6000,
        "chat_model": "llama-3.3-70b-versatile",
        "chat_provider": "groq",
        "query_expansions": 3,
        "reranker": "cross-encoder/ms-marco-MiniLM-L-6-v2",
    },
    "pro": {
        "embed_model": "text-embedding-3-large",
        "embed_provider": "openai",
        "chunk_size": 6000,
        "chunk_overlap": 600,
        "chunking_strategy": "semantic",
        "retrieve_k": 50,
        "rerank_k": 12,
        "context_tokens": 16000,
        "chat_model": "claude-3-5-sonnet-20241022",
        "chat_provider": "anthropic",
        "query_expansions": 5,
        "reranker": "cross-encoder/ms-marco-MiniLM-L-12-v2",
    },
}

# --- Admin ---
ADMIN_EMAILS = os.environ.get("ADMIN_EMAILS", "").split(",")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
