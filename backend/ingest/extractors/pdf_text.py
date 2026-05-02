"""Extract plain text from PDF bytes using pypdf (OSS)."""

from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


def extract_pdf_text(data: bytes) -> str:
    if not data or not data.strip():
        return ""
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ValueError("PDF extraction requires the 'pypdf' package.") from exc

    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        t = t.strip()
        if t:
            parts.append(t)
    return "\n\n".join(parts).strip()
