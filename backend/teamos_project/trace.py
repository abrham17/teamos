import uuid


def get_request_trace_id(request) -> str:
    header_value = (
        request.headers.get("X-Trace-Id")
        or request.headers.get("X-Request-Id")
        or request.META.get("HTTP_X_TRACE_ID")
        or request.META.get("HTTP_X_REQUEST_ID")
    )
    if header_value:
        return str(header_value).strip()
    return str(uuid.uuid4())


def coalesce_trace_id(trace_id: str | None, prefix: str = "trace") -> str:
    if trace_id and str(trace_id).strip():
        return str(trace_id).strip()
    return f"{prefix}-{uuid.uuid4()}"
