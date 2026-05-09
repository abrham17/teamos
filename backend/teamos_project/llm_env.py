"""Environment-only LLM helpers (safe to import while Django settings are loading)."""

from __future__ import annotations

import os
from typing import Mapping


def production_llm_backend_from_env(environ: Mapping[str, str] | None = None) -> str:
    """
    Resolve LLM_BACKEND for production settings.

    Defaults to openai unless ALLOW_NON_OPENAI_LLM_IN_PRODUCTION=1.
    """

    env = environ if environ is not None else os.environ
    if str(env.get("ALLOW_NON_OPENAI_LLM_IN_PRODUCTION", "")).strip() == "1":
        raw = (env.get("LLM_BACKEND") or "openai").lower().strip()
        return raw if raw in ("groq", "openai") else "openai"
    
    return "openai"
