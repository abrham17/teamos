from rest_framework import serializers
from ingest.models import WikiChangeSet
from .models import WikiPage, PageTemplate


class WikiPageListSerializer(serializers.ModelSerializer):
    summary = serializers.ReadOnlyField()

    class Meta:
        model = WikiPage
        fields = [
            "id", "title", "slug", "page_type", "frontmatter",
            "summary", "source_url", "raw_file_url",
            "created_by_id", "created_at", "updated_at",
        ]


class WikiPageDetailSerializer(serializers.ModelSerializer):
    summary = serializers.ReadOnlyField()
    created_by_email = serializers.SerializerMethodField()
    citations = serializers.SerializerMethodField()

    class Meta:
        model = WikiPage
        fields = [
            "id", "title", "slug", "content", "page_type", "frontmatter",
            "summary", "source_url", "raw_file_url", "citations",
            "created_by_id", "created_by_email", "created_at", "updated_at",
        ]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None

    def get_citations(self, obj):
        from ingest.models import WikiSourceCitation
        
        cits = WikiSourceCitation.objects.filter(wiki_page=obj).select_related("raw_source")
        return [
            {
                "id": str(c.id),
                "raw_source_id": str(c.raw_source_id),
                "source_type": c.raw_source.source_type,
                "original_filename": c.raw_source.original_filename,
                "wiki_section": c.wiki_section,
                "source_page_number": c.source_page_number,
                "source_timestamp": c.source_timestamp,
            }
            for c in cits
        ]


class WikiPageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WikiPage
        fields = ["title", "content", "page_type", "frontmatter", "source_url"]


class PageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PageTemplate
        fields = ["id", "name", "page_type", "default_content", "default_frontmatter", "is_builtin"]


class WikiChangeSetSerializer(serializers.ModelSerializer):
    job_id = serializers.UUIDField(source="job.id", read_only=True)
    wiki_slug = serializers.SerializerMethodField()
    baseline_content = serializers.SerializerMethodField()

    class Meta:
        model = WikiChangeSet
        fields = [
            "id",
            "job_id",
            "status",
            "proposed_content",
            "diff_summary",
            "wiki_slug",
            "baseline_content",
            "created_at",
            "updated_at",
        ]

    def get_wiki_slug(self, obj):
        wp = getattr(obj.job, "wiki_page", None)
        return wp.slug if wp else None

    def get_baseline_content(self, obj):
        wp = getattr(obj.job, "wiki_page", None)
        return (wp.content or "") if wp else ""
