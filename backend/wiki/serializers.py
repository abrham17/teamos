from rest_framework import serializers
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

    class Meta:
        model = WikiPage
        fields = [
            "id", "title", "slug", "content", "page_type", "frontmatter",
            "summary", "source_url", "raw_file_url",
            "created_by_id", "created_by_email", "created_at", "updated_at",
        ]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None


class WikiPageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WikiPage
        fields = ["title", "content", "page_type", "frontmatter", "source_url"]


class PageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PageTemplate
        fields = ["id", "name", "page_type", "default_content", "default_frontmatter", "is_builtin"]
