"""HTTP(S) URL fetch with basic SSRF protections and size limits."""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

import requests
from django.conf import settings

from ingest.extractors.limits import max_url_bytes, url_fetch_timeout_sec

logger = logging.getLogger(__name__)

_BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
    }
)


def _hostname_blocked(hostname: str | None) -> bool:
    if not hostname:
        return True
    h = hostname.lower().strip(".")
    if h in _BLOCKED_HOSTNAMES:
        return True
    if h.endswith(".local"):
        return True
    return False


def _ips_for_hostname(hostname: str) -> list[str]:
    infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    ips: list[str] = []
    for info in infos:
        ip = info[4][0]
        if ip not in ips:
            ips.append(ip)
    return ips


def _ip_blocked(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        return True
    if ip.version == 4:
        if ip in ipaddress.ip_network("169.254.0.0/16"):
            return True
    if ip.version == 6 and ip.is_site_local:
        return True
    return False


def _assert_url_safe(url: str) -> None:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http(s) URLs are allowed for ingest.")
    host = parsed.hostname
    if _hostname_blocked(host):
        raise ValueError("URL hostname is not allowed for ingest.")
    if not host:
        raise ValueError("URL is missing a hostname.")
    try:
        ips = _ips_for_hostname(host)
    except OSError as exc:
        raise ValueError(f"Could not resolve URL host: {exc}") from exc
    if not ips:
        raise ValueError("Could not resolve URL host.")
    for ip in ips:
        if _ip_blocked(ip):
            raise ValueError("URL resolves to a disallowed address (SSRF protection).")


def clean_html_to_text(raw_html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", raw_html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_url_text(url: str) -> str:
    _assert_url_safe(url)
    headers = {"User-Agent": getattr(settings, "INGEST_URL_USER_AGENT", "TeamOS-Ingest/1.0")}
    response = requests.get(
        url,
        timeout=url_fetch_timeout_sec(),
        headers=headers,
        stream=True,
        allow_redirects=True,
    )
    response.raise_for_status()
    content_type = (response.headers.get("Content-Type") or "").lower()

    total = 0
    chunks: list[bytes] = []
    for chunk in response.iter_content(chunk_size=64 * 1024):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_url_bytes():
            raise ValueError("URL response exceeds maximum allowed size.")
        chunks.append(chunk)
    raw_bytes = b"".join(chunks)

    charset = response.encoding or "utf-8"
    try:
        body = raw_bytes.decode(charset, errors="replace")
    except LookupError:
        body = raw_bytes.decode("utf-8", errors="replace")

    if "html" in content_type:
        return clean_html_to_text(body)
    return body.strip()
