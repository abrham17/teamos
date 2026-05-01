from typing import Any, Optional

from rest_framework.response import Response


def ok(data: Any = None, status_code: int = 200, meta: Optional[dict] = None):
    payload = {"success": True, "data": data}
    if meta is not None:
        payload["meta"] = meta
    return Response(payload, status=status_code)


def fail(
    message: str,
    status_code: int = 400,
    code: Optional[str] = None,
    details: Optional[Any] = None,
):
    error_payload = {"message": message}
    if code is not None:
        error_payload["code"] = code
    if details is not None:
        error_payload["details"] = details
    return Response({"success": False, "error": error_payload}, status=status_code)
