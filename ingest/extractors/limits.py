"""Size and budget limits for OSS ingest extractors (override via Django settings)."""

from django.conf import settings


def max_url_bytes() -> int:
    return int(getattr(settings, "INGEST_MAX_URL_BYTES", 5 * 1024 * 1024))


def max_upload_bytes() -> int:
    return int(getattr(settings, "INGEST_MAX_UPLOAD_BYTES", 25 * 1024 * 1024))


def max_repo_output_chars() -> int:
    return int(getattr(settings, "INGEST_MAX_REPO_OUTPUT_CHARS", 2_000_000))


def max_repo_file_bytes() -> int:
    return int(getattr(settings, "INGEST_MAX_REPO_FILE_BYTES", 512 * 1024))


def git_clone_timeout_sec() -> int:
    return int(getattr(settings, "INGEST_GIT_CLONE_TIMEOUT_SEC", 120))


def url_fetch_timeout_sec() -> int:
    return int(getattr(settings, "INGEST_URL_FETCH_TIMEOUT_SEC", 25))


def max_url_redirects() -> int:
    return int(getattr(settings, "INGEST_MAX_URL_REDIRECTS", 8))


def max_zip_members() -> int:
    return int(getattr(settings, "INGEST_MAX_ZIP_MEMBERS", 5000))


def max_zip_uncompressed_bytes() -> int:
    return int(getattr(settings, "INGEST_MAX_ZIP_UNCOMPRESSED_BYTES", 20 * 1024 * 1024))
