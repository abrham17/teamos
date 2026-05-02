# OSS / free-only ingestion

TeamOS ingest extractors use **no paid APIs** for turning sources into wiki text. Paid LLM steps (template detection, governance) may still use your configured chat backend; this document covers **extraction** only.

## Supported source types

| `source_type` | How it is submitted | Extraction stack |
|---------------|---------------------|------------------|
| `url` | `POST /api/ingest/:team_id/url/` | HTTP fetch + HTML stripping; SSRF limits and max response size ([`ingest/extractors/url_fetch.py`](../backend/ingest/extractors/url_fetch.py)). |
| `youtube` | Same URL endpoint when the URL is YouTube | Public captions via **youtube-transcript-api**; title via **oEmbed**; optional description from watch-page HTML. Fails clearly if no captions/description. |
| `repo` | URL job with `source_type=repo` (API TBD) or existing flow | Shallow **git clone** + text from source-like extensions; timeouts and output caps ([`repo.py`](../backend/ingest/extractors/repo.py)). |
| `markdown` | File upload `.md`/`.txt` | UTF-8 text. |
| `pdf` | File upload `.pdf` | **pypdf** text extraction. |
| `docx` | File upload `.docx` | **python-docx**. |
| `image` | Image upload (`png`, `jpg`, …) | **pytesseract** + system **Tesseract** binary. |
| `code_zip` | `.zip` upload | Stdlib **zipfile** + same extension allowlist as repo. |

## System dependencies

- **Tesseract** (`tesseract-ocr` package on Debian/Ubuntu) for image OCR.
- **git** for repository ingestion.

Not required for core paths: **ffmpeg** (video/audio ingestion is out of scope for this OSS plan).

## Environment / settings

Override in Django settings or env (see [`teamos_project/settings/base.py`](../backend/teamos_project/settings/base.py)):

- `INGEST_MAX_URL_BYTES`, `INGEST_MAX_UPLOAD_BYTES`
- `INGEST_MAX_REPO_OUTPUT_CHARS`, `INGEST_MAX_REPO_FILE_BYTES`, `INGEST_GIT_CLONE_TIMEOUT_SEC`
- `INGEST_URL_FETCH_TIMEOUT_SEC`, `INGEST_MAX_ZIP_MEMBERS`, `INGEST_MAX_ZIP_UNCOMPRESSED_BYTES`

## Explicitly excluded (not implemented here)

- Paid **vision** models for images/diagrams.
- **Cloud ASR** or paid speech APIs for video/audio transcripts.
- **Cloud OCR** (Textract, Document AI, etc.).
- Full **video file** or **generic audio** transcription pipelines.

See [PRODUCTION_DEV_ONLY_STRIPPING.md](PRODUCTION_DEV_ONLY_STRIPPING.md) for dev vs prod LLM notes (orthogonal to extractors).

## Staging files

Binary uploads are stored on `IngestJob.staging_file` under `ingest_staging/` and **deleted** after extraction succeeds or fails.

## See also

- [LOCAL_AND_DOCKER.md](LOCAL_AND_DOCKER.md) — running the stack.
