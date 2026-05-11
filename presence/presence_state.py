import logging
from django.core.cache import cache

logger = logging.getLogger(__name__)

class TeamPresenceManager:
    """
    Manages real-time presence state for teams using Redis/Cache.
    """
    CACHE_KEY_PREFIX = "presence:team:{team_id}"
    TTL = 60 # 1 minute

    @classmethod
    def update_presence(cls, team_id: str, user_email: str, page_slug: str = None, is_typing: bool = False):
        key = cls.CACHE_KEY_PREFIX.format(team_id=team_id)
        current = cache.get(key) or {}
        current[user_email] = {
            "page": page_slug,
            "is_typing": is_typing,
            "last_active": True, # For now just a boolean, can be timestamp
        }
        cache.set(key, current, cls.TTL)
        return current

    @classmethod
    def remove_presence(cls, team_id: str, user_email: str):
        key = cls.CACHE_KEY_PREFIX.format(team_id=team_id)
        current = cache.get(key) or {}
        if user_email in current:
            del current[user_email]
            cache.set(key, current, cls.TTL)
        return current

    @classmethod
    def get_team_presence(cls, team_id: str):
        key = cls.CACHE_KEY_PREFIX.format(team_id=team_id)
        return cache.get(key) or {}
