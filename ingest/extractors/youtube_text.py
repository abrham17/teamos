"""YouTube captions / description via OSS libraries (no paid ASR)."""

from __future__ import annotations

import logging
import re
from urllib.parse import parse_qs, quote, urlparse

import requests

from ingest.extractors.limits import url_fetch_timeout_sec
from ingest.extractors.url_fetch import _assert_url_safe

logger = logging.getLogger(__name__)


def youtube_video_id(url: str) -> str | None:
    u = urlparse(url.strip())
    host = (u.hostname or "").lower()
    if host in ("youtu.be", "www.youtu.be"):
        vid = u.path.strip("/").split("/")[0]
        return vid[:32] if re.match(r"^[a-zA-Z0-9_-]{6,}$", vid) else None
    if host.endswith("youtube.com"):
        if u.path.startswith("/watch"):
            v = parse_qs(u.query).get("v", [None])[0]
            if v and re.match(r"^[a-zA-Z0-9_-]{6,}$", v):
                return v[:32]
        m = re.match(r"^/(?:embed|v|shorts)/([a-zA-Z0-9_-]{6,})", u.path)
        if m:
            return m.group(1)[:32]
    return None


def _fetch_oembed_title_description(url: str) -> tuple[str, str]:
    """YouTube oEmbed is public JSON (no API key)."""
    oembed = f"https://www.youtube.com/oembed?url={quote(url, safe='')}&format=json"
    try:
        r = requests.get(oembed, timeout=url_fetch_timeout_sec())
        r.raise_for_status()
        data = r.json()
        title = (data.get("title") or "").strip()
        # oEmbed does not include description; use watch page HTML text as weak fallback
        desc = ""
        return title, desc
    except Exception as exc:
        logger.debug("oEmbed failed: %s", exc)
        return "", ""


def _fetch_watch_page_description(url: str) -> str:
    """Best-effort: pull meta description from raw watch HTML (avoid aggressive HTML stripping)."""
    _assert_url_safe(url)
    try:
        r = requests.get(url, timeout=url_fetch_timeout_sec(), headers={"User-Agent": "TeamOS-Ingest/1.0"})
        r.raise_for_status()
        raw = r.text
    except Exception:
        return ""
    m = re.search(
        r'<meta\s+name="description"\s+content="([^"]*)"',
        raw,
        re.IGNORECASE,
    )
    if m:
        from urllib.parse import unquote

        return unquote(m.group(1).replace("&quot;", '"')).strip()
    return ""


def extract_youtube_text(url: str) -> str:
    _assert_url_safe(url)
    vid = youtube_video_id(url)
    if not vid:
        raise ValueError("Could not parse a YouTube video ID from the URL.")

    lines: list[str] = []

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        logger.warning("youtube_transcript_api not installed; transcript skipped.")
    else:
        try:
            transcript = YouTubeTranscriptApi.get_transcript(vid)
            cap = " ".join(entry.get("text", "") for entry in transcript if entry.get("text"))
            cap = re.sub(r"\s+", " ", cap).strip()
            if cap:
                lines.append(f"YouTube transcript (video {vid}):\n{cap}")
        except Exception as exc:
            logger.info("YouTube transcript unavailable: %s", exc)

    title, _ = _fetch_oembed_title_description(url)
    if title:
        lines.insert(0, f"Title: {title}")

    if not lines or (len(lines) == 1 and lines[0].startswith("Title:")):
        desc = _fetch_watch_page_description(url)
        if desc:
            lines.append(f"Description:\n{desc}")

    out = "\n\n".join(lines).strip()
    if not out:
        raise ValueError(
            "No captions or description text could be extracted for this YouTube URL. "
            "Add public captions to the video or use a different source."
        )
    return out
