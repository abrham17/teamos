"""Central place for which LLM model name to pass to the OpenAI-compatible client."""

from django.conf import settings


def chat_completion_model() -> str:
    """Groq in development (see settings); OpenAI model in production."""
    if getattr(settings, "LLM_BACKEND", "openai").lower() == "groq":
        return getattr(settings, "GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
    return getattr(settings, "OPENAI_CHAT_MODEL", "gpt-4o")
