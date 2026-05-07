"""Central place for LLM backend, chat model names, and embedding configuration."""

from __future__ import annotations

from django.conf import settings

from teamos_project.llm_env import production_llm_backend_from_env

__all__ = [
    "production_llm_backend_from_env",
    "get_llm_backend",
    "chat_completion_model",
    "embedding_model_name",
    "effective_embedding_dimensions",
]


def get_llm_backend() -> str:
    raw = getattr(settings, "LLM_BACKEND", "openai") or "openai"
    b = str(raw).lower().strip()
    return b if b in ("groq", "openai") else "openai"


def chat_completion_model() -> str:
    """Groq in development (see settings); OpenAI model when backend is openai."""
    if get_llm_backend() == "groq":
        return getattr(settings, "GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
    return getattr(settings, "OPENAI_CHAT_MODEL", "gpt-4o")


def embedding_model_name() -> str:
    return getattr(settings, "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


def effective_embedding_dimensions() -> int:
    """Vector size for Qdrant collections; keep aligned with embedding model output."""
    if not getattr(settings, "OPENAI_API_KEY", None):
        return 384  # Default for all-MiniLM-L6-v2

    raw = getattr(settings, "OPENAI_EMBEDDING_DIMENSIONS", None)
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    model = embedding_model_name().lower()
    if "large" in model and "small" not in model:
        return 3072
    return 1536
