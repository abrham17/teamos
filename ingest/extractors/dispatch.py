"""Route ingest jobs to OSS extractors and return plain UTF-8 text."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ingest.extractors import code_zip, docx_text, image_ocr, pdf_text, repo, url_fetch, youtube_text

if TYPE_CHECKING:
    from ingest.models import IngestJob

logger = logging.getLogger(__name__)


def extract_plain_text(job: "IngestJob", source_text: str = "") -> str:
    """
    Produce extractable plain text for ``job.source_type``.

    ``source_text`` is used for markdown/text uploads passed through the task.
    Binary types (pdf, docx, image, code_zip) read from ``job.staging_file`` when set.
    """
    st = (job.source_type or "").strip().lower()

    if st in ("markdown",):
        text = (source_text or "").strip()
        if not text:
            if getattr(job, "staging_file", None) and job.staging_file:
                try:
                    with job.staging_file.open("rb") as fh:
                        text = fh.read().decode("utf-8", errors="ignore").strip()
                except Exception:
                    pass
            if not text and getattr(job, "staging_data", None):
                text = bytes(job.staging_data).decode("utf-8", errors="ignore").strip()
        return text

    if st == "url":
        return url_fetch.fetch_url_text(job.source_url)

    if st == "youtube":
        return youtube_text.extract_youtube_text(job.source_url)

    if st == "repo":
        return repo.fetch_repo_text(job.source_url)

    if st in ("pdf", "docx", "image", "code_zip"):
        data = None
        # Try staging_file first (standard behavior)
        if getattr(job, "staging_file", None) and job.staging_file:
            try:
                with job.staging_file.open("rb") as fh:
                    data = fh.read()
            except (AttributeError, FileNotFoundError, ValueError):
                logger.warning("Staging file missing on this worker, attempting fallback to staging_data")

        # Fallback to staging_data (Heroku workaround)
        if not data and getattr(job, "staging_data", None):
            data = bytes(job.staging_data)

        if not data:
            raise ValueError(f"Missing staging content for source_type={st}. (Dyno isolation issue?)")

        if st == "pdf":
            return pdf_text.extract_pdf_text(data)
        if st == "docx":
            return docx_text.extract_docx_text(data)
        if st == "image":
            return image_ocr.extract_image_ocr(data)
        return code_zip.extract_code_zip(data)

    raise ValueError(f"Unsupported source_type for extraction: {st}")
