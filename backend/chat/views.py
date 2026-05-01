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
from teamos_project.entitlements import check_quota
from product_analytics.services import record_first_once
from .models import ChatSession, ChatMessage, ChatTokenUsage
from .serializers import ChatSessionSerializer
from teamos_project.api_response import ok, fail

logger = logging.getLogger(__name__)


def estimate_tokens(text: str) -> int:
    # Lightweight approximation: ~4 chars/token for English-like text.
    return max(1, len((text or "").strip()) // 4)

class ChatSessionListView(APIView):
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        sessions = ChatSession.objects.filter(team_id=team_id, created_by=request.user)
        return ok(ChatSessionSerializer(sessions, many=True).data)

    def post(self, request, team_id):
        session = ChatSession.objects.create(
            team_id=team_id,
            created_by=request.user,
            title=request.data.get("title", "New Chat")
        )
        return ok(ChatSessionSerializer(session).data, status_code=201)


class ChatSessionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id, session_id):
        try:
            session = ChatSession.objects.get(id=session_id, team_id=team_id, created_by=request.user)
        except ChatSession.DoesNotExist:
            return fail("Chat session not found.", status_code=404, code="chat_session_not_found")
        return ok(ChatSessionSerializer(session).data)

    def delete(self, request, team_id, session_id):
        deleted_count, _ = ChatSession.objects.filter(
            id=session_id, team_id=team_id, created_by=request.user
        ).delete()
        if deleted_count == 0:
            return fail("Chat session not found.", status_code=404, code="chat_session_not_found")
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
            return fail("Chat session not found.", status_code=404, code="chat_session_not_found")

        user_message = request.data.get("message", "").strip()
        if not user_message:
            return fail("Message required.", status_code=400, code="message_required")
        quota = check_quota(session.team, "token_consume")
        if not quota.allowed:
            return fail(
                "Plan token limit reached.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )

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
                    chunk_id = res.payload.get("chunk_id")
                    anchor_hint = res.payload.get("heading") or res.payload.get("section") or ""
                    
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
                        "score": float(res.score),
                        "chunk_id": chunk_id,
                        "anchor_hint": anchor_hint,
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
                recent_messages = list(session.messages.order_by("-created_at")[:10])
                for msg in reversed(recent_messages):
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
                prompt_tokens = estimate_tokens(system_prompt) + estimate_tokens(user_message)
                completion_tokens = estimate_tokens(full_content)
                ChatTokenUsage.objects.create(
                    team=session.team,
                    user=request.user,
                    session=session,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=prompt_tokens + completion_tokens,
                    metadata={"model": "gpt-4o"},
                )
                if ChatMessage.objects.filter(session__team=session.team, role="assistant").count() == 1:
                    record_first_once(
                        event_name="first_chat_answer_received",
                        team=session.team,
                        user=request.user,
                        properties={"session_id": str(session.id)},
                    )
                yield f"event: done\ndata: {json.dumps({'status': 'done'})}\n\n"

            except Exception as e:
                logger.error(f"Chat stream failed: {e}")
                yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
