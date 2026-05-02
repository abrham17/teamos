"""Shallow git clone and aggregate text from source files (OSS, local git binary)."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile

from ingest.extractors.limits import (
    git_clone_timeout_sec,
    max_repo_file_bytes,
    max_repo_output_chars,
)
from ingest.extractors.url_fetch import _assert_url_safe

logger = logging.getLogger(__name__)

_SKIP_DIR_NAMES = frozenset(
    {
        ".git",
        "node_modules",
        "vendor",
        "__pycache__",
        ".venv",
        "venv",
        ".tox",
        "dist",
        "build",
        ".next",
        ".nuxt",
        "target",
    }
)

_SOURCE_EXTENSIONS = (
    ".py",
    ".pyi",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".java",
    ".kt",
    ".kts",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".cs",
    ".swift",
    ".scala",
    ".md",
    ".markdown",
    ".txt",
    ".rst",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".dockerfile",
    ".cmake",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".cc",
)


def fetch_repo_text(repo_url: str) -> str:
    _assert_url_safe(repo_url)
    temp_dir = tempfile.mkdtemp(prefix="ingest_repo_")
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", repo_url, temp_dir],
            check=True,
            capture_output=True,
            text=True,
            timeout=git_clone_timeout_sec(),
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Git clone timed out.") from exc
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or exc.stdout or "").strip()
        raise ValueError(f"Git clone failed: {err[:500]}") from exc

    aggregated: list[str] = []
    total_chars = 0
    try:
        for root, dirnames, files in os.walk(temp_dir):
            dirnames[:] = [d for d in dirnames if d not in _SKIP_DIR_NAMES]
            base = os.path.basename(root)
            if base in _SKIP_DIR_NAMES:
                dirnames[:] = []
                continue
            for name in files:
                if not name.endswith(_SOURCE_EXTENSIONS):
                    continue
                path = os.path.join(root, name)
                try:
                    size = os.path.getsize(path)
                except OSError:
                    continue
                if size > max_repo_file_bytes():
                    logger.info("Skipping large repo file: %s (%s bytes)", path, size)
                    continue
                rel_path = os.path.relpath(path, temp_dir)
                try:
                    with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                        body = handle.read()
                except OSError:
                    continue
                block = f"\n--- FILE: {rel_path} ---\n{body}"
                if total_chars + len(block) > max_repo_output_chars():
                    logger.info("Repo text budget reached; truncating.")
                    remaining = max_repo_output_chars() - total_chars
                    if remaining > 200:
                        aggregated.append(block[:remaining])
                    break
                aggregated.append(block)
                total_chars += len(block)
        return "\n".join(aggregated).strip()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
