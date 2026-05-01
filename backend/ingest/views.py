from rest_framework.views import APIView
from rest_framework import status, permissions
from .models import IngestJob
from .serializers import IngestJobSerializer
from accounts.models import Team
from accounts.permissions import IsTeamMember, CanIngest
from .tasks import run_ingest_job
from teamos_project.api_response import ok, fail
from teamos_project.entitlements import check_quota
from teamos_project.trace import get_request_trace_id

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
        
        job = IngestJob.objects.create(
            team=team,
            created_by=request.user,
            source_type="url",
            source_url=url,
            status="pending",
            ingest_stage="queued",
            ingest_stage_detail="Queued for processing",
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

        filename = file_obj.name or ""
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        source_type = "markdown"
        if extension in ("pdf", "docx", "md", "markdown"):
            source_type = extension if extension in ("pdf", "docx") else "markdown"

        raw_bytes = file_obj.read()
        if not raw_bytes:
            return fail(
                "Uploaded file is empty.",
                status_code=status.HTTP_400_BAD_REQUEST,
                code="empty_file_upload",
            )
        source_text = raw_bytes.decode("utf-8", errors="ignore").strip()
        if not source_text:
            return fail(
                "Could not extract text from uploaded file.",
                status_code=status.HTTP_400_BAD_REQUEST,
                code="file_text_extraction_failed",
            )

        job = IngestJob.objects.create(
            team=team,
            created_by=request.user,
            source_type=source_type,
            source_filename=filename,
            status="pending",
            ingest_stage="queued",
            ingest_stage_detail="Queued for processing",
        )

        trace_id = get_request_trace_id(request)
        run_ingest_job.delay(str(job.id), source_text, trace_id=trace_id)

        return ok(IngestJobSerializer(job).data, status_code=status.HTTP_201_CREATED)
