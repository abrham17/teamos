from django.contrib import admin
from .models import TeamSubscription

@admin.register(TeamSubscription)
class TeamSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("team", "plan_key", "status", "trial_expires_at", "grace_expires_at")
    list_filter = ("plan_key", "status")
    search_fields = ("team__name",)
    readonly_fields = ("created_at", "updated_at")
