import hashlib
import json
import logging
from dataclasses import asdict
from django.core.cache import cache
from chat.intent.schema import IntentSchema

logger = logging.getLogger(__name__)

CACHE_TTL = 60 * 60 * 4  # 4 hours

def cache_key(message: str, team_id: str) -> str:
    # Hash of team_id + lowercased message
    content = f"{team_id}:{message.strip().lower()}"
    return f"intent_cache:{hashlib.sha256(content.encode()).hexdigest()}"

def get_cached_intent(message: str, team_id: str) -> IntentSchema | None:
    key = cache_key(message, team_id)
    cached = cache.get(key)
    if cached:
        try:
            if isinstance(cached, str):
                data = json.loads(cached)
            else:
                data = cached
            return IntentSchema(
                intent_type=data["intent_type"],
                complexity=data["complexity"],
                domains=data.get("domains", []),
                required_capabilities=data.get("required_capabilities", []),
                parallelizable=data.get("parallelizable", False),
                estimated_rounds=data.get("estimated_rounds", 4),
                requires_external=data.get("requires_external", False),
                confidence=data.get("confidence", 1.0)
            )
        except Exception:
            logger.warning("Failed to deserialize cached intent schema")
            return None
    return None

def cache_intent(message: str, team_id: str, intent: IntentSchema):
    key = cache_key(message, team_id)
    try:
        cache.set(key, asdict(intent), timeout=CACHE_TTL)
    except Exception:
        logger.warning("Failed to cache intent schema")
