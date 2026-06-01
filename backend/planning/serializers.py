from rest_framework import serializers

from accounts.models import TeamMember

from .models import (
    Milestone, PlanChunk, Project, Task, TaskComment, Notification, ProjectMember,
    CanvasLayout, CanvasTemplate, IntegrationAction, ProjectIntegrationConfig,
)


class TaskSerializer(serializers.ModelSerializer):
    assignee_email = serializers.SerializerMethodField()
    dependencies = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    parent_task_id = serializers.UUIDField(allow_null=True, required=False)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "status",
            "priority",
            "assignee_id",
            "assignee_email",
            "start_date",
            "end_date",
            "dependencies",
            "parent_task_id",
            "order_index",
            "semantic_key",
            "human_locked_fields",
            "created_by_id",
            "created_at",
            "updated_at",
        ]

    def get_assignee_email(self, obj):
        return obj.assignee.email if obj.assignee else None


class ProjectMemberSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMember
        fields = ["id", "user", "role", "joined_at"]

    def get_user(self, obj):
        from accounts.serializers import UserSerializer
        return UserSerializer(obj.user).data


class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = [
            "id",
            "title",
            "description",
            "target_date",
            "status",
            "order_index",
            "semantic_key",
            "human_locked_fields",
            "created_by_id",
            "created_at",
            "updated_at",
        ]


class ProjectListSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField(source="tasks.count", read_only=True)
    milestone_count = serializers.IntegerField(source="milestones.count", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "description",
            "status",
            "task_count",
            "milestone_count",
            "created_by_id",
            "created_at",
            "updated_at",
        ]


class ProjectDetailSerializer(serializers.ModelSerializer):
    tasks = TaskSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    members = ProjectMemberSerializer(many=True, read_only=True)
    chunks = serializers.SerializerMethodField()
    related_wiki_pages = serializers.SerializerMethodField()

    def get_chunks(self, obj):
        chunks = PlanChunk.objects.filter(project=obj).order_by("chunk_index")
        return PlanChunkSerializer(chunks, many=True).data

    def get_related_wiki_pages(self, obj):
        from wiki.serializers import WikiPageListSerializer
        pages = obj.related_wiki_pages.filter(is_deleted=False).order_by("-updated_at")
        return WikiPageListSerializer(pages, many=True).data

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "description",
            "status",
            "tasks",
            "milestones",
            "members",
            "chunks",
            "related_wiki_pages",
            "created_by_id",
            "created_at",
            "updated_at",
        ]


class ProjectWriteSerializer(serializers.ModelSerializer):
    tasks = serializers.ListField(child=serializers.DictField(), required=False)
    milestones = serializers.ListField(child=serializers.DictField(), required=False)
    members = serializers.ListField(child=serializers.DictField(), required=False)

    class Meta:
        model = Project
        fields = ["name", "description", "status", "tasks", "milestones", "members"]


class TaskWriteSerializer(serializers.ModelSerializer):
    dependency_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, write_only=True
    )
    parent_task_id = serializers.UUIDField(allow_null=True, required=False)

    class Meta:
        model = Task
        fields = [
            "title",
            "description",
            "status",
            "priority",
            "assignee_id",
            "start_date",
            "end_date",
            "dependency_ids",
            "parent_task_id",
            "order_index",
        ]

    def validate_assignee_id(self, value):
        team_id = self.context.get("team_id")
        if value and not TeamMember.objects.filter(team_id=team_id, user_id=value).exists():
            raise serializers.ValidationError("Assignee must be a member of this team.")
        return value


class MilestoneWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = ["title", "description", "target_date", "status", "order_index"]


class PlanChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanChunk
        fields = [
            "id",
            "chunk_index",
            "source_kind",
            "source_ref_id",
            "title",
            "content",
            "created_at",
        ]


class TaskCommentSerializer(serializers.ModelSerializer):
    author_email = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = TaskComment
        fields = [
            "id",
            "task_id",
            "author_id",
            "author_email",
            "author_name",
            "content",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author_id", "author_email", "author_name", "created_at", "updated_at"]

    def get_author_email(self, obj):
        return obj.author.email if obj.author else None

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.email if obj.author else None


class TaskCommentWriteSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=5000)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "user_id", "team_id", "notification_type", "title", "message", "link", "is_read", "created_at"]
        read_only_fields = ["id", "user_id", "team_id", "created_at"]


class CanvasLayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = CanvasLayout
        fields = ["id", "project_id", "nodes", "edges", "viewport", "updated_by_id", "updated_at"]
        read_only_fields = ["id", "project_id", "updated_by_id", "updated_at"]


class CanvasLayoutWriteSerializer(serializers.Serializer):
    nodes = serializers.ListField(child=serializers.DictField(), required=False)
    edges = serializers.ListField(child=serializers.DictField(), required=False)
    viewport = serializers.DictField(required=False)


class CanvasTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CanvasTemplate
        fields = ["id", "team_id", "name", "description", "nodes", "edges", "created_by_id", "created_at", "updated_at"]
        read_only_fields = ["id", "team_id", "created_by_id", "created_at", "updated_at"]


class CanvasTemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True)
    nodes = serializers.ListField(child=serializers.DictField())
    edges = serializers.ListField(child=serializers.DictField())


class IntegrationActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationAction
        fields = [
            "id", "project_id", "entity_type", "entity_id", "action",
            "provider", "external_ref", "status", "error_message", "created_at",
        ]
        read_only_fields = fields


class ProjectIntegrationConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectIntegrationConfig
        fields = [
            "project_id",
            "auto_calendar_sync", "auto_slack_notify", "auto_github_issues",
            "auto_jira_issues", "auto_linear_issues",
            "slack_channel", "github_repo", "jira_project_key", "linear_team_id",
            "notify_on_assign", "notify_on_overdue", "notify_on_complete", "notify_on_milestone",
        ]
