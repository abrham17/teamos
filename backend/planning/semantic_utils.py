"""Stable semantic identity helpers for planning entities."""

from __future__ import annotations

import hashlib
import re


def normalize_title(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def compute_semantic_key(
    *,
    title: str,
    capability: str = "",
    subsystem: str = "",
    objective: str = "",
    explicit_key: str | None = None,
) -> str:
    if explicit_key:
        key = str(explicit_key).strip().lower()[:64]
        if key:
            return key
    parts = [
        normalize_title(capability),
        normalize_title(subsystem),
        normalize_title(objective or title),
    ]
    joined = "|".join(p for p in parts if p)
    if not joined:
        joined = normalize_title(title) or "untitled"
    digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()
    return digest[:16]


def title_key(value: str | None) -> str:
    return normalize_title(value)


def entity_text_for_embedding(title: str, description: str = "") -> str:
    return f"{title}\n{description or ''}".strip()
