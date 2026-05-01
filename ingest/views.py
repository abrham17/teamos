from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.shortcuts import get_object_or_404
from .models import IngestJob
from .serializers import IngestJobSerializer
from accounts.models import Team

class IngestJobListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, team_id):
        team = get_object_or_404(Team, id=team_id)
        # Check if user is member of team (omitted for brevity in MVP)
        jobs = IngestJob.objects.filter(team=team).order_by("-created_at")[:10]
        serializer = IngestJobSerializer(jobs, many=True)
        return Response(serializer.data)

class UrlIngestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
        
        # In a real app, we would trigger a Celery task here:
        # process_url_ingest.delay(job.id)
        
        return Response(IngestJobSerializer(job).data, status=status.HTTP_201_CREATED)

class FileIngestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, team_id):
        team = get_object_or_404(Team, id=team_id)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "File is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        job = IngestJob.objects.create(
            team=team,
            created_by=request.user,
            source_type="markdown", # Default for now
            source_filename=file_obj.name,
            status="pending"
        )
        
        # In a real app, we would save the file and trigger a Celery task:
        # process_file_ingest.delay(job.id, file_path)
        
        # For mock/MVP purposes, let's auto-complete it after a few seconds
        # (This would normally be in a background worker)
        
        return Response(IngestJobSerializer(job).data, status=status.HTTP_201_CREATED)
