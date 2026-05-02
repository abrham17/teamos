"""Image to text via Tesseract (OSS). Optional system binary required."""

from __future__ import annotations

import io
import logging

from PIL import Image

logger = logging.getLogger(__name__)


def extract_image_ocr(data: bytes) -> str:
    if not data or not data.strip():
        return ""
    try:
        import pytesseract
    except ImportError as exc:
        raise ValueError("Image OCR requires 'pytesseract' and a system Tesseract binary.") from exc

    try:
        img = Image.open(io.BytesIO(data))
        if getattr(img, "n_frames", 1) > 1:
            img.seek(0)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
    except Exception as exc:
        raise ValueError(f"Could not open image: {exc}") from exc

    try:
        text = pytesseract.image_to_string(img)
    except Exception as exc:
        if exc.__class__.__name__ == "TesseractNotFoundError":
            raise ValueError(
                "Tesseract is not installed on the server. Install the 'tesseract-ocr' package."
            ) from exc
        raise ValueError(f"OCR failed: {exc}") from exc

    return (text or "").strip()
