from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User, Team, TeamMember, TeamInvite, TeamAuditEvent


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ["id", "clerk_user_id", "username", "email", "first_name", "last_name", "display_name", "avatar_url", "created_at"]


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=60, default="")
    last_name = serializers.CharField(max_length=60, default="")

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value.lower()

    def validate_username(self, value):
        username = value.strip()
        if not username:
            return ""
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("Username is already taken.")
        return username

    def create(self, validated_data):
        username = validated_data.get("username", "").strip() or validated_data["email"]
        user = User.objects.create_user(
            username=username,
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs["email"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        attrs["user"] = user
        return attrs


class TeamSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "slug",
            "plan",
            "is_deleted",
            "deleted_at",
            "purge_after",
            "created_at",
            "member_count",
        ]

    def get_member_count(self, obj):
        return obj.members.count()


class TeamMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = TeamMember
        fields = ["id", "user", "role", "joined_at"]


class TeamInviteSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    accept_url = serializers.SerializerMethodField()
    lifecycle_status = serializers.SerializerMethodField()

    class Meta:
        model = TeamInvite
        fields = [
            "id",
            "token",
            "invitee_email",
            "role",
            "expires_at",
            "used_at",
            "revoked_at",
            "created_by",
            "send_status",
            "sent_at",
            "lifecycle_status",
            "accept_url",
        ]

    def get_accept_url(self, obj):
        frontend_url = self.context.get("frontend_url", "")
        if not frontend_url:
            return ""
        return f"{frontend_url.rstrip('/')}/accept-invite?token={obj.token}"

    def get_lifecycle_status(self, obj):
        return obj.lifecycle_status


class InviteCreateSerializer(serializers.Serializer):
    invitee_email = serializers.EmailField()
    role = serializers.ChoiceField(choices=["owner", "editor", "viewer"], default="editor")

    def validate_invitee_email(self, value):
        return value.lower().strip()


class TeamAuditEventSerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)

    class Meta:
        model = TeamAuditEvent
        fields = ["id", "event_type", "metadata", "created_at", "actor"]
