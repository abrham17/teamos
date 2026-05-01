import logging
import json
import time
import uuid

class StructuredLogger:
    """
    Provides consistent structured logging (JSON-ready) for production observability.
    """
    def __init__(self, name):
        self.logger = logging.getLogger(name)

    def _log(self, level, message, **kwargs):
        log_data = {
            "timestamp": time.time(),
            "level": level,
            "message": message,
            "trace_id": kwargs.get("trace_id", str(uuid.uuid4())),
            "context": kwargs
        }
        self.logger.log(getattr(logging, level.upper()), json.dumps(log_data))

    def info(self, message, **kwargs):
        self._log("info", message, **kwargs)

    def error(self, message, **kwargs):
        self._log("error", message, **kwargs)

    def warning(self, message, **kwargs):
        self._log("warning", message, **kwargs)

# Global trace logger
ops_logger = StructuredLogger("teamos.ops")
