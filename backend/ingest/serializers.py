from rest_framework import serializers
from .models import IngestJob

class IngestJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = IngestJob
        fields = [
            "id", "source_type", "source_url", "source_filename", 
            "status", "chunk_count", "error", "wiki_page", 
            "created_at", "updated_at"
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]
