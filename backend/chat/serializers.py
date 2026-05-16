from rest_framework import serializers
from .models import ChatSession, ChatMessage


class ChatMessageSlimSerializer(serializers.ModelSerializer):
    """Slim version of ChatMessage that truncates large metadata blobs for performance."""
    metadata = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "citations", "metadata", "created_at"]

    def get_metadata(self, obj):
        if not obj.metadata:
            return {}
        # Deep copy to avoid modifying the original model instance if it's cached
        import copy
        meta = copy.deepcopy(obj.metadata)
        
        # Truncate tool_trace to keep the response size manageable
        if "tool_trace" in meta and isinstance(meta["tool_trace"], list):
            if len(meta["tool_trace"]) > 5:
                meta["tool_trace"] = meta["tool_trace"][:5]
                meta["_trace_truncated"] = True
        return meta


class ChatSessionSerializer(serializers.ModelSerializer):
    # Use the slim version to protect against R14/H12 errors during session retrieval
    messages = ChatMessageSlimSerializer(many=True, read_only=True)

    class Meta:
        model = ChatSession
        fields = ["id", "title", "created_at", "updated_at", "messages"]
