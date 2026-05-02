from rest_framework import serializers
from .models import IngestJob

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "source_metadata", "created_at", "updated_at"]
