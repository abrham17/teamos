from django.contrib import admin
from integrations.models import UserIntegration, OAuthToken, ToolExecutionLog

@admin.register(UserIntegration)
class UserIntegrationAdmin(admin.ModelAdmin):
    list_display = ("user", "provider", "status", "external_user_email", "created_at")
    list_filter = ("provider", "status")
    search_fields = ("user__email", "provider", "external_user_email")

@admin.register(OAuthToken)
class OAuthTokenAdmin(admin.ModelAdmin):
    list_display = ("integration", "expires_at", "updated_at")
    raw_id_fields = ("integration",)

@admin.register(ToolExecutionLog)
class ToolExecutionLogAdmin(admin.ModelAdmin):
    list_display = ("user", "provider", "tool_name", "success", "latency_ms", "timestamp")
    list_filter = ("provider", "success")
    search_fields = ("user__email", "provider", "tool_name")
