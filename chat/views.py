import json
import time
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.models import TeamMember
from .models import ChatSession, ChatMessage
from .serializers import ChatSessionSerializer


def get_membership(user, team_id):
    try:
        return TeamMember.objects.get(user=user, team_id=team_id)
    except TeamMember.DoesNotExist:
        return None


class ChatSessionListView(APIView):
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        sessions = ChatSession.objects.filter(team_id=team_id, created_by=request.user)
        return Response(ChatSessionSerializer(sessions, many=True).data)

    def post(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        session = ChatSession.objects.create(
            team_id=team_id,
            created_by=request.user,
            title=request.data.get("title", "New Chat")
        )
        return Response(ChatSessionSerializer(session).data, status=201)


class ChatSessionDetailView(APIView):
    def get(self, request, team_id, session_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        try:
            session = ChatSession.objects.get(id=session_id, team_id=team_id, created_by=request.user)
        except ChatSession.DoesNotExist:
            return Response(status=404)
        return Response(ChatSessionSerializer(session).data)

    def delete(self, request, team_id, session_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        ChatSession.objects.filter(id=session_id, team_id=team_id, created_by=request.user).delete()
        return Response(status=204)


class ChatQueryStreamView(APIView):
    """
    POST /api/chat/:team_id/sessions/:session_id/query/
    Accepts: { "message": "hello" }
    Returns SSE stream.
    """
    def post(self, request, team_id, session_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
            
        try:
            session = ChatSession.objects.get(id=session_id, team_id=team_id, created_by=request.user)
        except ChatSession.DoesNotExist:
            return Response(status=404)

        user_message = request.data.get("message", "").strip()
        if not user_message:
            return Response({"detail": "Message required"}, status=400)

        # 1. Save user message
        ChatMessage.objects.create(session=session, role="user", content=user_message)

        # 2. Update title if it's the first message
        if session.messages.count() == 1:
            session.title = user_message[:50] + ("..." if len(user_message) > 50 else "")
            session.save()

        # 3. Stream generator
        def event_stream():
            # Mocking RAG pipeline steps
            
            # Step 1: Retrieval
            yield f"event: status\ndata: {json.dumps({'status': 'Searching knowledge base...'})}\n\n"
            time.sleep(0.5)
            
            # Mock Citations
            mock_citations = [
                {"page_slug": "project-brief", "page_title": "Project Brief", "score": 0.92},
                {"page_slug": "architecture", "page_title": "Architecture", "score": 0.85}
            ]
            yield f"event: citations\ndata: {json.dumps({'citations': mock_citations})}\n\n"
            
            # Step 2: Generation
            yield f"event: status\ndata: {json.dumps({'status': 'Generating response...'})}\n\n"
            
            mock_response = "Based on the team wiki, the architecture uses Next.js and Django. We are currently implementing Phase 3 which includes the SSE streaming interface and the Tiered RAG pipeline."
            
            # Stream tokens
            for chunk in mock_response.split(" "):
                yield f"event: chunk\ndata: {json.dumps({'token': chunk + ' '})}\n\n"
                time.sleep(0.05)
                
            # Finalize and save assistant message
            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=mock_response,
                citations=mock_citations
            )
            yield f"event: done\ndata: {json.dumps({'status': 'done'})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
