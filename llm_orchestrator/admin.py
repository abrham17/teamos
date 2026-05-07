from django.contrib import admin
from .models import TeamApiUsage

@admin.register(TeamApiUsage)
class TeamApiUsageAdmin(admin.ModelAdmin):
    list_display = ("team", "operation", "model_used", "cost_usd", "created_at")
    list_filter = ("operation", "model_used", "billing_month")
    search_fields = ("team__name", "user__email")
    readonly_fields = ("created_at",)
