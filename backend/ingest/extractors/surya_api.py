"""
Surya OCR API client.
Routes PDF and Image extractions to a hosted/self-hosted Surya OCR API server
if SURYA_API_URL is configured in the environment.
"""

from __future__ import annotations

import logging
import os
import requests

logger = logging.getLogger(__name__)


def extract_via_surya_api(data: bytes, file_type: str) -> str | None:
    """
    Sends document bytes to the Surya OCR API server.
    
    Supported file_types: 'pdf', 'image'
    
    Configuration (environment variables):
      - SURYA_API_URL: e.g., 'http://surya-service:8000/ocr' or 'https://api.datalab.to/v1/ocr'
      - SURYA_API_KEY: Optional bearer token / API key
    """
    api_url = os.environ.get("SURYA_API_URL")
    if not api_url:
        return None

    api_key = os.environ.get("SURYA_API_KEY")
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    # Determine filename & content-type based on extraction target
    filename = f"document.{'pdf' if file_type == 'pdf' else 'png'}"
    content_type = "application/pdf" if file_type == "pdf" else "image/png"

    try:
        files = {"file": (filename, data, content_type)}
        logger.info("Sending %s to Surya OCR API (%s)", filename, api_url)
        
        response = requests.post(api_url, files=files, headers=headers, timeout=90)
        response.raise_for_status()
        
        # Parse result: handles both Datalab formats and simple FastAPI return JSONs
        res_json = response.json()
        if "text" in res_json:
            return str(res_json["text"]).strip()
        elif "content" in res_json:
            return str(res_json["content"]).strip()
        elif "pages" in res_json:
            # Reconstruct multi-page text
            pages_text = []
            for idx, p in enumerate(res_json["pages"]):
                text_lines = p.get("text_lines") or []
                if isinstance(text_lines, list):
                    page_content = "\n".join(str(line.get("text", line) if isinstance(line, dict) else line) for line in text_lines)
                else:
                    page_content = str(p.get("text", ""))
                pages_text.append(page_content)
            return "\n\n--- Page Break ---\n\n".join(pages_text).strip()
            
        logger.warning("Surya OCR API returned unrecognized response format: %s", res_json)
        return None

    except Exception as e:
        logger.warning("Surya OCR API call failed (will fall back to legacy extractors): %s", e)
        return None
