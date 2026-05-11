"""Unpack a .zip of source files and aggregate text (stdlib zipfile, OSS)."""

from __future__ import annotations

import io
import logging
import zipfile

from ingest.extractors.limits import max_repo_file_bytes, max_repo_output_chars, max_zip_members
from ingest.extractors.repo import _SKIP_DIR_NAMES, _SOURCE_EXTENSIONS

logger = logging.getLogger(__name__)


def extract_code_zip(data: bytes) -> str:
    if not data:
        return ""
    aggregated: list[str] = []
    total_chars = 0
    members = 0
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid or corrupted zip file.") from exc

    with zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            members += 1
            if members > max_zip_members():
                logger.info("Zip member limit reached.")
                break
            name = info.filename.replace("\\", "/")
            parts = name.split("/")
            if any(p in _SKIP_DIR_NAMES for p in parts):
                continue
            if not name.lower().endswith(_SOURCE_EXTENSIONS):
                continue
            if info.file_size > max_repo_file_bytes():
                logger.info("Skipping large zip member: %s", name)
                continue
            try:
                body = zf.read(info).decode("utf-8", errors="ignore")
            except Exception:
                continue
            block = f"\n--- FILE: {name} ---\n{body}"
            if total_chars + len(block) > max_repo_output_chars():
                remaining = max_repo_output_chars() - total_chars
                if remaining > 200:
                    aggregated.append(block[:remaining])
                break
            aggregated.append(block)
            total_chars += len(block)

    return "\n".join(aggregated).strip()
