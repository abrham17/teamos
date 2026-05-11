from django.apps import AppConfig
import logging


class WikiConfig(AppConfig):
    name = 'wiki'

    def ready(self):
        from django.conf import settings

        logger = logging.getLogger(__name__)
        storage_backend = getattr(settings, "STORAGES", {}).get("default", {}).get("BACKEND", "unknown")
        media_url = getattr(settings, "MEDIA_URL", "")
        logger.info(
            "Wiki storage config: backend=%s media_url=%s absolute_media=%s",
            storage_backend,
            media_url,
            bool(media_url and str(media_url).startswith("http")),
        )
