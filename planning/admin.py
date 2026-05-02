from django.contrib import admin

from .models import Milestone, PlanChunk, Project, Task


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "team", "status", "updated_at")
    search_fields = ("name", "description", "team__name")
    list_filter = ("status", "team")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "status", "priority", "assignee", "end_date")
    search_fields = ("title", "description", "project__name")
    list_filter = ("status", "priority")


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "status", "target_date")
    search_fields = ("title", "description", "project__name")
    list_filter = ("status",)


@admin.register(PlanChunk)
class PlanChunkAdmin(admin.ModelAdmin):
    list_display = ("project", "chunk_index", "source_kind", "title")
    search_fields = ("project__name", "title", "content")
    list_filter = ("source_kind",)
