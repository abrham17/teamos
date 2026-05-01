from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.shortcuts import get_object_or_404
from .models import IngestJob
from .serializers import IngestJobSerializer
from accounts.models import Team
from accounts.permissions import IsTeamMember, CanIngest
from .tasks import run_ingest_job

class IngestJobListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        team = get_object_or_404(Team, id=team_id)
        jobs = IngestJob.objects.filter(team=team).order_by("-created_at")[:10]
        serializer = IngestJobSerializer(jobs, many=True)
        return Response(serializer.data)

class UrlIngestView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanIngest]

    def post(self, request, team_id):
        team = get_object_or_404(Team, id=team_id)
        url = request.data.get("url")
        if not url:
            return Response({"error": "URL is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        job = IngestJob.objects.create(
            team=team,
            created_by=request.user,
            source_type="url",
            source_url=url,
            status="pending"
        )
        run_ingest_job.delay(str(job.id))

        return Response(IngestJobSerializer(job).data, status=status.HTTP_201_CREATED)

class FileIngestView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanIngest]

    def post(self, request, team_id):
        team = get_object_or_404(Team, id=team_id)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "File is required"}, status=status.HTTP_400_BAD_REQUEST)

        filename = file_obj.name or ""
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        source_type = "markdown"
        if extension in ("pdf", "docx", "md", "markdown"):
            source_type = extension if extension in ("pdf", "docx") else "markdown"

        raw_bytes = file_obj.read()
        if not raw_bytes:
            return Response({"error": "Uploaded file is empty."}, status=status.HTTP_400_BAD_REQUEST)
        source_text = raw_bytes.decode("utf-8", errors="ignore").strip()
        if not source_text:
            return Response({"error": "Could not extract text from uploaded file."}, status=status.HTTP_400_BAD_REQUEST)

        job = IngestJob.objects.create(
            team=team,
            created_by=request.user,
            source_type=source_type,
            source_filename=filename,
            status="pending"
        )

        run_ingest_job.delay(str(job.id), source_text)

        return Response(IngestJobSerializer(job).data, status=status.HTTP_201_CREATED)
