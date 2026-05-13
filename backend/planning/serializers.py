from rest_framework import serializers

from accounts.models import TeamMember

from .models import Milestone, PlanChunk, Project, Task, TaskComment, Notification, ProjectMember


class TaskSerializer(serializers.ModelSerializer):
    assignee_email = serializers.SerializerMethodField()
    dependencies = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

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
            "order_index",
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

    def get_chunks(self, obj):
        chunks = PlanChunk.objects.filter(project=obj).order_by("chunk_index")
        return PlanChunkSerializer(chunks, many=True).data

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
