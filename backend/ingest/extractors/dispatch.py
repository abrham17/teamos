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
        if not text and getattr(job, "staging_file", None) and job.staging_file:
            try:
                with job.staging_file.open("rb") as fh:
                    text = fh.read().decode("utf-8", errors="ignore").strip()
            except Exception as exc:
                raise ValueError(f"Could not read uploaded text file: {exc}") from exc
        return text

    if st == "url":
        return url_fetch.fetch_url_text(job.source_url)

    if st == "youtube":
        return youtube_text.extract_youtube_text(job.source_url)

    if st == "repo":
        return repo.fetch_repo_text(job.source_url)

    if st in ("pdf", "docx", "image", "code_zip"):
        if not getattr(job, "staging_file", None) or not job.staging_file:
            raise ValueError(f"Missing staging file for source_type={st}.")
        
        try:
            with job.staging_file.open("rb") as fh:
                if fh is None:
                    raise ValueError(f"Staging file could not be opened for source_type={st}.")
                data = fh.read()
        except (AttributeError, FileNotFoundError) as exc:
            raise ValueError(f"Staging file is missing or inaccessible on this worker: {exc}") from exc
        if st == "pdf":
            return pdf_text.extract_pdf_text(data)
        if st == "docx":
            return docx_text.extract_docx_text(data)
        if st == "image":
            return image_ocr.extract_image_ocr(data)
        return code_zip.extract_code_zip(data)

    raise ValueError(f"Unsupported source_type for extraction: {st}")
