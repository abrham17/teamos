from rest_framework import serializers
from .models import IngestJob, KnowledgeActivity, AsyncDeadLetter

class IngestJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = IngestJob
        fields = [
            "id",
            "source_type",
            "source_url",
            "source_filename",
            "source_metadata",
            "status",
            "ingest_stage",
            "ingest_stage_detail",
            "chunk_count",
            "error",
            "wiki_page",
            "auto_approve",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "source_metadata", "created_at", "updated_at"]


class KnowledgeActivitySerializer(serializers.ModelSerializer):
    page_title = serializers.CharField(source="page.title", read_only=True, default="")

    class Meta:
        model = KnowledgeActivity
        fields = [
            "id",
            "event_type",
            "page",
            "page_title",
            "summary",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class AsyncDeadLetterSerializer(serializers.ModelSerializer):
    class Meta:
        model = AsyncDeadLetter
        fields = [
            "id",
            "task_name",
            "trace_id",
            "error_message",
            "payload",
            "metadata",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
