import time
import logging
import json
from typing import List, Dict, Any, Optional

from django.conf import settings
from openai import OpenAI

from .router import get_routed_model
from .telemetry import log_api_usage
from billing.models import TeamSubscription
from ingest.vectors import vector_store

import hashlib
from django.core.cache import cache

logger = logging.getLogger(__name__)

# ── Singleton LLM client pool (avoids re-instantiation per call) ─────
_openai_client: OpenAI | None = None
_openrouter_client: OpenAI | None = None
_clients_initialized = False


def _is_valid_key(k):
    return k and k.strip() and k.lower() != "not_set"


def _get_llm_client() -> OpenAI:
    """Return a cached LLM client (created once, reused forever)."""
    global _openai_client, _openrouter_client, _clients_initialized

    if not _clients_initialized:
        openai_key = getattr(settings, "OPENAI_API_KEY", "")
        openrouter_key = getattr(settings, "OPENROUTER_API_KEY", "")

        if _is_valid_key(openrouter_key):
            _openrouter_client = OpenAI(
                api_key=openrouter_key,
                base_url=getattr(settings, "OPENROUTER_API_BASE",
                                 "https://openrouter.ai/api/v1"),
                default_headers={
                    "HTTP-Referer": "https://team-os.tech",
                    "X-Title": "TeamOS",
                },
            )
        if _is_valid_key(openai_key):
            _openai_client = OpenAI(api_key=openai_key)

        _clients_initialized = True

    backend = getattr(settings, "LLM_BACKEND", "openai").lower()
    if (backend == "openrouter" or _openai_client is None) and _openrouter_client:
        return _openrouter_client
    if _openai_client:
        return _openai_client
    raise ValueError(
        "No valid LLM client available. Set OPENAI_API_KEY or OPENROUTER_API_KEY."
    )


def llm_call(
    team,
    operation: str,
    messages: List[Dict[str, str]],
    user=None,
    stream: bool = False,
    response_format: Optional[Dict[str, Any]] = None,
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Optional[str] = "auto",
) -> Any:
    """
    The central gateway for all LLM calls in TeamOS.
    Handles routing, tracking, and execution.
    """
    # 1. Get team subscription
    from billing.models import TeamSubscription
    try:
        subscription = team.subscription
    except Exception:
        # Fallback for teams without subscription record
        subscription, _ = TeamSubscription.objects.get_or_create(team=team)

    # 2. Route to appropriate model
    model_name, routed_by = get_routed_model(subscription, operation)
    
    # 3. Execution
    start_time = time.time()
    
    # Use singleton client pool
    client = _get_llm_client()

    try:
        # Handle JSON mode if requested and supported
        # Note: GPT-4.1-nano might not support json_object mode, we might need a wrapper
        # For now we pass it through
        
        call_kwargs = {
            "model": model_name,
            "messages": messages,
            "stream": stream,
            "temperature": temperature,
        }
        if response_format:
            call_kwargs["response_format"] = response_format
        if max_tokens:
            call_kwargs["max_tokens"] = max_tokens
        if tools:
            call_kwargs["tools"] = tools
            call_kwargs["tool_choice"] = tool_choice


        # Semantic Caching
        cache_key = None
        if not stream and temperature < 0.5: # Only cache deterministic calls
            last_msg = messages[-1]["content"] if messages else ""
            msg_hash = hashlib.sha256(f"{operation}:{last_msg}".encode()).hexdigest()
            cache_key = f"llm_cache:{msg_hash}"
            cached = cache.get(cache_key)
            if cached:
                logger.info(f"LLM cache hit for {operation}")
                return cached, model_name, "cache"

        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                response = client.chat.completions.create(**call_kwargs)
                break
            except Exception as e:
                if attempt < max_retries:
                    logger.warning(f"LLM call failed, retrying ({attempt+1}/{max_retries}): {e}")
                    time.sleep(1.5 ** attempt)
                    # Fallback to DeepSeek V4 Flash if Pro/R1 fails
                    if "v4-pro" in call_kwargs["model"] or "r1" in call_kwargs["model"] or "reasoner" in call_kwargs["model"]:
                        call_kwargs["model"] = "deepseek/deepseek-v4-flash"
                else:
                    raise e
        
        # 4. Telemetry
        latency_ms = int((time.time() - start_time) * 1000)
        
        if not stream:
            usage = response.usage
            input_tokens = usage.prompt_tokens
            output_tokens = usage.completion_tokens
            
            log_api_usage(
                team=team,
                user=user,
                operation=operation,
                model_used=call_kwargs["model"],
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                routed_by=routed_by
            )
            
            if cache_key:
                cache.set(cache_key, response, timeout=900) # Cache for 15 mins
            
        return response, call_kwargs["model"], routed_by

    except Exception as e:
        logger.error(f"LLM Call failed: {str(e)}", extra={
            "team_id": str(team.id),
            "operation": operation,
            "model": model_name
        })
        raise e

def llm_json_call(
    team,
    operation: str,
    messages: List[Dict[str, str]],
    user=None,
    default_on_error: Any = None,
    max_tokens: Optional[int] = None,
    temperature: float = 0.7,
    sse_queue: Optional[Any] = None,
) -> Any:
    """
    Helper for JSON-wrapped calls.
    """
    if sse_queue is not None:
        try:
            resp, model_used, routed_by = llm_call(
                team=team,
                operation=operation,
                messages=messages,
                user=user,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )
            full_content = []
            for chunk in resp:
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    reasoning_piece = getattr(delta, "reasoning_content", None) or (
                        delta.model_extra.get("reasoning_content") if hasattr(delta, "model_extra") and delta.model_extra else None
                    )
                    if reasoning_piece:
                        sse_queue.put(f"event: thinking\ndata: {json.dumps({'content': reasoning_piece})}\n\n")
                    if delta.content:
                        full_content.append(delta.content)
            content = "".join(full_content).strip()
            content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            return json.loads(content)
        except Exception:
            logger.exception("Streaming JSON call failed in orchestrator")
            return default_on_error

    try:
        # Attempt json_object mode
        resp, model_used, routed_by = llm_call(
            team=team,
            operation=operation,
            messages=messages,
            user=user,
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = resp.choices[0].message.content
        return json.loads(content)
    except Exception:
        # Fallback to plain completion with JSON enforcement
        try:
            msgs = list(messages)
            if msgs and msgs[-1]["role"] == "user":
                msgs[-1]["content"] += "\n\nRespond with a single JSON object only, no markdown fences."
            
            resp, model_used, routed_by = llm_call(
                team=team,
                operation=operation,
                messages=msgs,
                user=user,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            content = resp.choices[0].message.content.strip()
            # Basic cleanup of markdown fences if any
            content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            return json.loads(content)
        except Exception:
            return default_on_error

