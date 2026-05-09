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

logger = logging.getLogger(__name__)

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
    try:
        subscription = team.subscription
    except TeamSubscription.DoesNotExist:
        # Fallback for teams without subscription record (should not happen with signals)
        from billing.models import TeamSubscription
        subscription, _ = TeamSubscription.objects.get_or_create(team=team)

    # 2. Route to appropriate model
    model_name, routed_by = get_routed_model(subscription, operation)
    
    # 3. Execution
    start_time = time.time()
    
    # Selection of client
    client = None
    
    # Priority 1: OpenRouter (if explicitly chosen or key exists)
    if (getattr(settings, "LLM_BACKEND", "") == "openrouter" or 
        not settings.OPENAI_API_KEY) and getattr(settings, "OPENROUTER_API_KEY", ""):
        client = OpenAI(
            api_key=settings.OPENROUTER_API_KEY,
            base_url=getattr(settings, "OPENROUTER_API_BASE", "https://openrouter.ai/api/v1"),
            default_headers={
                "HTTP-Referer": "https://team-os.tech",
                "X-Title": "TeamOS",
            }
        )
    # Priority 2: Direct OpenAI
    elif settings.OPENAI_API_KEY:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
    
    if not client:
        raise ValueError("No LLM client available. Set OPENAI_API_KEY or OPENROUTER_API_KEY.")

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


        response = client.chat.completions.create(**call_kwargs)
        
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
                model_used=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                routed_by=routed_by
            )
            
        return response, model_name, routed_by

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
) -> Any:
    """
    Helper for JSON-wrapped calls.
    """
    try:
        # Attempt json_object mode
        resp, model_used, routed_by = llm_call(
            team=team,
            operation=operation,
            messages=messages,
            user=user,
            response_format={"type": "json_object"}
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
                user=user
            )
            content = resp.choices[0].message.content.strip()
            # Basic cleanup of markdown fences if any
            content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            return json.loads(content)
        except Exception:
            return default_on_error
