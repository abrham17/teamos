from urllib.parse import urlparse

from django.core.files.base import ContentFile
from rest_framework import permissions, status
from rest_framework.views import APIView

from accounts.models import Team
from accounts.permissions import CanIngest, IsTeamMember
from ingest.extractors.limits import max_upload_bytes
from ingest.models import IngestJob
from ingest.serializers import IngestJobSerializer
from ingest.tasks import run_ingest_job
from teamos_project.api_response import fail, ok
from teamos_project.entitlements import check_quota
from teamos_project.trace import get_request_trace_id

_IMAGE_EXTENSIONS = frozenset(
    {"png", "jpg", "jpeg", "webp", "gif", "tif", "tiff", "bmp"}
)
_TEXT_EXTENSIONS = frozenset({"md", "markdown", "txt"})


def _is_youtube_url(url: str) -> bool:
    try:
        host = (urlparse(url.strip()).hostname or "").lower()
    except Exception:
        return False
    return host.endswith("youtube.com") or host in ("youtu.be", "m.youtube.com", "www.youtu.be")


class IngestJobListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        try:
            team = Team.objects.get(id=team_id)
        except Team.DoesNotExist:
            return fail("Team not found.", status_code=404, code="team_not_found")
        jobs = IngestJob.objects.filter(team=team).order_by("-created_at")[:10]
        serializer = IngestJobSerializer(jobs, many=True)
        return ok(serializer.data)


class UrlIngestView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanIngest]

    def post(self, request, team_id):
        try:
            team = Team.objects.get(id=team_id)
        except Team.DoesNotExist:
            return fail("Team not found.", status_code=404, code="team_not_found")
        quota = check_quota(team, "ingest_job_create")
        if not quota.allowed:
            return fail(
                "Plan limit reached for ingest jobs.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )
        url = request.data.get("url")
        if not url:
            return fail("URL is required.", status_code=status.HTTP_400_BAD_REQUEST, code="url_required")

        auto_approve = request.data.get("auto_approve", True)
        if isinstance(auto_approve, str):
            auto_approve = auto_approve.strip().lower() in ("1", "true", "yes", "on")

        source_type = "youtube" if _is_youtube_url(url) else "url"
        job = IngestJob.objects.create(
            team=team,
            created_by=request.user,
            source_type=source_type,
            source_url=url,
            status="pending",
            ingest_stage="queued",
            ingest_stage_detail="Queued for processing",
            auto_approve=bool(auto_approve),
        )
        trace_id = get_request_trace_id(request)
        run_ingest_job.delay(str(job.id), trace_id=trace_id)

        return ok(IngestJobSerializer(job).data, status_code=status.HTTP_201_CREATED)


class FileIngestView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanIngest]

    def post(self, request, team_id):
        try:
            team = Team.objects.get(id=team_id)
        except Team.DoesNotExist:
            return fail("Team not found.", status_code=404, code="team_not_found")
        quota = check_quota(team, "ingest_job_create")
        if not quota.allowed:
            return fail(
                "Plan limit reached for ingest jobs.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )
        file_obj = request.FILES.get("file")
        if not file_obj:
            return fail("File is required.", status_code=status.HTTP_400_BAD_REQUEST, code="file_required")

        auto_approve = request.POST.get("auto_approve", "true")
        if isinstance(auto_approve, str):
            auto_approve = auto_approve.strip().lower() in ("1", "true", "yes", "on")
        else:
            auto_approve = bool(auto_approve)

        filename = file_obj.name or ""
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        raw_bytes = file_obj.read()
        if not raw_bytes:
            return fail(
                "Uploaded file is empty.",
                status_code=status.HTTP_400_BAD_REQUEST,
                code="empty_file_upload",
            )
        max_b = max_upload_bytes()
        if len(raw_bytes) > max_b:
            return fail(
                f"File exceeds maximum size ({max_b // (1024 * 1024)} MiB).",
                status_code=status.HTTP_400_BAD_REQUEST,
                code="file_too_large",
            )

        # Determine source_type based on extension
        if extension in ("pdf", "docx"):
            source_type = extension
        elif extension == "zip":
            source_type = "code_zip"
        elif extension in _IMAGE_EXTENSIONS:
            source_type = "image"
        elif extension in _TEXT_EXTENSIONS or extension == "":
            source_type = "markdown"
        else:
            return fail(
                "Unsupported file type for ingest. Use pdf, docx, zip (code), images (png/jpg/…), or markdown/text.",
                status_code=status.HTTP_400_BAD_REQUEST,
                code="unsupported_file_type",
            )

        job = IngestJob.objects.create(
            team=team,
            created_by=request.user,
            source_type=source_type,
            source_filename=filename,
            status="pending",
            ingest_stage="queued",
            ingest_stage_detail="Queued for processing",
            auto_approve=auto_approve,
            staging_data=raw_bytes,
        )
        job.staging_file.save(filename, ContentFile(raw_bytes), save=True)
        
        trace_id = get_request_trace_id(request)
        # We always read from staging_file in the worker now
        run_ingest_job.delay(str(job.id), "", trace_id=trace_id)
        
        return ok(IngestJobSerializer(job).data, status_code=status.HTTP_201_CREATED)


class KnowledgeActivityListView(APIView):
    """Chronological log of how the wiki evolves — read-only."""
    permission_classes = [permissions.IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        from ingest.models import KnowledgeActivity
        from ingest.serializers import KnowledgeActivitySerializer

        try:
            team = Team.objects.get(id=team_id)
        except Team.DoesNotExist:
            return fail("Team not found.", status_code=404, code="team_not_found")

        limit = min(int(request.query_params.get("limit", 50)), 200)
        activities = KnowledgeActivity.objects.filter(team=team).select_related("page").order_by("-created_at")[:limit]
        return ok(KnowledgeActivitySerializer(activities, many=True).data)


class AsyncDeadLetterListView(APIView):
    """Admin view for failed async tasks — list and requeue."""
    permission_classes = [permissions.IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        from ingest.models import AsyncDeadLetter
        from ingest.serializers import AsyncDeadLetterSerializer

        only_new = request.query_params.get("status", "new")
        limit = min(int(request.query_params.get("limit", 50)), 200)
        qs = AsyncDeadLetter.objects.filter(status=only_new).order_by("-created_at")[:limit]
        return ok(AsyncDeadLetterSerializer(qs, many=True).data)

    def patch(self, request, team_id):
        """Mark a dead letter as resolved or requeued."""
        from ingest.models import AsyncDeadLetter

        dl_id = request.data.get("id")
        new_status = request.data.get("status")
        if not dl_id or new_status not in ("requeued", "resolved"):
            return fail("Provide id and status (requeued|resolved).", status_code=400, code="invalid_params")

        try:
            dl = AsyncDeadLetter.objects.get(id=dl_id)
        except AsyncDeadLetter.DoesNotExist:
            return fail("Dead letter not found.", status_code=404, code="not_found")

        dl.status = new_status
        dl.save(update_fields=["status", "updated_at"])
        return ok({"id": str(dl.id), "status": dl.status})
