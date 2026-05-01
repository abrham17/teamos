import json
import logging
import time
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings

from accounts.permissions import IsTeamMember
from ingest.vectors import vector_store
from wiki.models import WikiPage
from .models import ChatSession, ChatMessage
from .serializers import ChatSessionSerializer

logger = logging.getLogger(__name__)

class ChatSessionListView(APIView):
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        sessions = ChatSession.objects.filter(team_id=team_id, created_by=request.user)
        return Response(ChatSessionSerializer(sessions, many=True).data)

    def post(self, request, team_id):
        session = ChatSession.objects.create(
            team_id=team_id,
            created_by=request.user,
            title=request.data.get("title", "New Chat")
        )
        return Response(ChatSessionSerializer(session).data, status=201)


class ChatSessionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id, session_id):
        try:
            session = ChatSession.objects.get(id=session_id, team_id=team_id, created_by=request.user)
        except ChatSession.DoesNotExist:
            return Response(status=404)
        return Response(ChatSessionSerializer(session).data)

    def delete(self, request, team_id, session_id):
        ChatSession.objects.filter(id=session_id, team_id=team_id, created_by=request.user).delete()
        return Response(status=204)


class ChatQueryStreamView(APIView):
    """
    POST /api/chat/:team_id/sessions/:session_id/query/
    Implements a High-Performance Citational RAG Pipeline.
    """
    permission_classes = [IsAuthenticated, IsTeamMember]

    def post(self, request, team_id, session_id):
        try:
            session = ChatSession.objects.get(id=session_id, team_id=team_id, created_by=request.user)
        except ChatSession.DoesNotExist:
            return Response(status=404)

        user_message = request.data.get("message", "").strip()
        if not user_message:
            return Response({"detail": "Message required"}, status=400)

        # 1. Save user message
        ChatMessage.objects.create(session=session, role="user", content=user_message)

        # 2. Update title if needed
        if session.messages.count() <= 2:
            session.title = user_message[:50] + ("..." if len(user_message) > 50 else "")
            session.save()

        def event_stream():
            # Step 1: Retrieval
            yield f"event: status\ndata: {json.dumps({'status': 'Searching team wiki...'})}\n\n"
            
            try:
                # Query vector store (Qdrant)
                results = vector_store.search_similar_pages(team_id, user_message, limit=10)
                
                citations = []
                context_blocks = []
                for res in results:
                    page_id = res.payload.get("page_id")
                    title = res.payload.get("page_title", "Untitled")
                    snippet = res.payload.get("content", "")
                    
                    # Try to get slug for frontend navigation
                    slug = "unknown"
                    try:
                        p = WikiPage.objects.only("slug").get(id=page_id)
                        slug = p.slug
                    except: pass

                    citations.append({
                        "page_id": page_id,
                        "page_title": title,
                        "page_slug": slug,
                        "snippet": snippet[:200],
                        "score": float(res.score)
                    })
                    context_blocks.append(f"SOURCE: {title}\nCONTENT: {snippet}")

                yield f"event: citations\ndata: {json.dumps({'citations': citations})}\n\n"
                
                # Step 2: Generation
                yield f"event: status\ndata: {json.dumps({'status': 'Thinking...'})}\n\n"
                
                context_str = "\n\n".join(context_blocks)
                system_prompt = (
                    "You are the TeamOS AI. Answer based ONLY on the provided Wiki context. "
                    "If the information is not in the context, say you don't know. "
                    "Cite sources by using [Source Title]. "
                    "If you find a contradiction, point it out. "
                    "Context:\n" + context_str
                )

                # Build history
                history = [{"role": "system", "content": system_prompt}]
                for msg in session.messages.all()[-10:]: # Last 10 messages
                    history.append({"role": msg.role, "content": msg.content})

                # Stream from OpenAI
                full_content = ""
                stream = vector_store.openai.chat.completions.create(
                    model="gpt-4o", # Or from settings
                    messages=history,
                    stream=True
                )

                for chunk in stream:
                    token = chunk.choices[0].delta.content or ""
                    if token:
                        full_content += token
                        yield f"event: chunk\ndata: {json.dumps({'token': token})}\n\n"

                # Finalize
                ChatMessage.objects.create(
                    session=session,
                    role="assistant",
                    content=full_content,
                    citations=citations
                )
                yield f"event: done\ndata: {json.dumps({'status': 'done'})}\n\n"

            except Exception as e:
                logger.error(f"Chat stream failed: {e}")
                yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
