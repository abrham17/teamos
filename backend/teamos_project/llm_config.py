"""Central place for LLM backend and embedding configuration. Standardized on OpenAI."""

from __future__ import annotations
from django.conf import settings

__all__ = [
    "embedding_model_name",
    "effective_embedding_dimensions",
]

def embedding_model_name() -> str:
    return getattr(settings, "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

def effective_embedding_dimensions() -> int:
    """Vector size for PGVector fields; keep aligned with embedding model output."""
    return getattr(settings, "OPENAI_EMBEDDING_DIMENSIONS", 1536)
