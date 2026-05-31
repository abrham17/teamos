from django.contrib import admin

from .models import ResearchLog, TeamResearchQuota


@admin.register(TeamResearchQuota)
class TeamResearchQuotaAdmin(admin.ModelAdmin):
    list_display = ("team", "searches_this_month", "max_searches_per_month", "last_reset_date", "updated_at")
    search_fields = ("team__name", "team__slug")
    list_filter = ("last_reset_date",)


@admin.register(ResearchLog)
class ResearchLogAdmin(admin.ModelAdmin):
    list_display = ("team", "action", "raw_query", "optimized_search_query", "timestamp")
    search_fields = ("team__name", "raw_query", "optimized_search_query", "urls_accessed")
    list_filter = ("action", "timestamp")

