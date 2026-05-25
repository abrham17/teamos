import asyncio
import json
import logging
import queue
import threading

from django.http import HttpResponse, StreamingHttpResponse
from openai import OpenAI
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings

from accounts.permissions import IsTeamMember
from accounts.team_access import has_minimum_role
from ingest.vectors import vector_store
from wiki.models import WikiPage
from teamos_project.entitlements import check_quota
from product_analytics.services import record_first_once
from .models import ChatSession, ChatMessage, ChatTokenUsage
from .serializers import ChatSessionSerializer
from teamos_project.api_response import ok, fail
from llm_orchestrator.orchestrator import llm_call, llm_json_call

logger = logging.getLogger(__name__)

TTS_MAX_CHARS = 4000
TTS_ALLOWED_VOICES = frozenset({"alloy", "echo", "fable", "onyx", "nova", "shimmer"})


def estimate_tokens(text: str) -> int:
    # Lightweight approximation: ~4 chars/token for English-like text.
    return max(1, len((text or "").strip()) // 4)


def _build_ask_system_prompt(context_str: str) -> str:
    """Strict RAG enforced; refuses to answer from external knowledge."""
    ctx = (context_str or "").strip()
    if not ctx:
        return (
            "You are the TeamOS AI assistant. No relevant team knowledge was found in the wiki or project plans for this query. "
            "CRITICAL RULE: Do NOT use your general knowledge, the internet, or external sources to answer this question. "
            "Simply state that the information was not found in the team's indexed knowledge and suggest that they "
            "might need to document this in the Wiki or Ingest more data. "
            "Do not hallucinate sources or titles."
        )
    return (
        "You are the TeamOS AI, a deep-reasoning specialist. Answer based exclusively on the provided team knowledge context. "
        "Context includes wiki pages and planning data (projects, tasks, milestones, schedules, assignees). "
        "Understand casual questions the way a teammate would: 'what's due this week', 'who owns deploy', "
        "'did we hit the beta milestone' — connect snippets across sources. "
        "INFERENCE RULE: If the answer is not literal, use the provided context to INFER the answer through semantic connection. "
        "STRICT RULE: If no logical inference can be made from the context, state that the information is missing. "
        "Never use outside knowledge. "
        "CITATION RULE: Cite sources as [Source Title] or [Project Name / Task Title]. "
        "Format in GitHub Markdown with ### headings and tables for data. "
        "Use Mermaid diagrams for workflows. "
        "Context:\n" + context_str
    )



class ChatCapabilitiesView(APIView):
    """GET /api/chat/:team_id/capabilities/ — UI hints for chat modes."""

    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        m = request.team_membership
        # Strategy standardizes on OpenAI-capable features for all paid tiers
        agent_ok = True 
        return ok(
            {
                "can_edit_wiki": has_minimum_role(m, "editor"),
                "can_edit_plans": has_minimum_role(m, "editor"),
                "can_ingest": has_minimum_role(m, "editor"),
                "agent_mode_available": agent_ok,
                "plan_mode_available": agent_ok,
            }
        )


class ChatTTSView(APIView):
    """
    POST /api/chat/:team_id/tts/
    Body: { "text": "...", "voice": "alloy" } (voice optional).
    Returns audio/mpeg bytes from OpenAI speech API.
    """

    permission_classes = [IsAuthenticated, IsTeamMember]

    def post(self, request, team_id):
        text = (request.data.get("text") or "").strip()
        if not text:
            return fail("Text required.", status_code=400, code="text_required")

        text = text[:TTS_MAX_CHARS]
        voice = (request.data.get("voice") or settings.OPENAI_TTS_DEFAULT_VOICE or "alloy").lower()
        if voice not in TTS_ALLOWED_VOICES:
            voice = "alloy"

        if not settings.OPENAI_API_KEY:
            return fail(
                "TTS is not configured (OPENAI_API_KEY).",
                status_code=503,
                code="tts_unconfigured",
            )

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        model = settings.OPENAI_TTS_MODEL or "tts-1"
        try:
            binary = client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                response_format="mp3",
            )
            audio_bytes = binary.read()
        except Exception as e:
            logger.exception("OpenAI TTS failed: %s", e)
            return fail("TTS generation failed.", status_code=502, code="tts_failed")

        return HttpResponse(audio_bytes, content_type="audio/mpeg")


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
    Ask mode: RAG + stream (default). Agent mode: tool loop + stream (editors, OpenAI backend only).
    Body: { "message": "...", "mode": "ask" | "agent" | "plan" }
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

        mode = (request.data.get("mode") or "ask").strip().lower()
        if mode not in ("ask", "agent", "plan"):
            return fail("Invalid mode.", status_code=400, code="invalid_mode")

        if mode in ("agent", "plan"):
            if not has_minimum_role(request.team_membership, "editor"):
                code = "agent_forbidden" if mode == "agent" else "plan_forbidden"
                return fail("Editor or owner role required.", status_code=403, code=code)

        quota = check_quota(session.team, "token_consume")
        if not quota.allowed:
            return fail(
                "Plan token limit reached.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )

        ChatMessage.objects.create(
            session=session,
            role="user",
            content=user_message,
            metadata={"mode": mode},
        )

        if session.messages.count() <= 2:
            session.title = user_message[:50] + ("..." if len(user_message) > 50 else "")
            session.save()

        membership = request.team_membership

        def event_stream():
            from chat.universal_stream import iter_universal_intelligence_events
            
            try:
                agent_state: dict = {}
                
                # Run the universal intelligence stream (handles classification, RAG, and execution)
                for line in iter_universal_intelligence_events(
                    team=session.team,
                    user=request.user,
                    session=session,
                    prompt=user_message,
                    state=agent_state
                ):
                    yield line

                # Post-stream persistence and tracking
                if agent_state.get("ok"):
                    full_content = agent_state.get("full_text") or ""
                    tool_trace = agent_state.get("tool_trace") or []
                    citations = agent_state.get("citations") or []
                    model_used = agent_state.get("model_used", "gpt-4o")
                    
                    # Store assistant message if one was generated (Lightweight or Agent modes)
                    if full_content:
                        ChatMessage.objects.create(
                            session=session,
                            role="assistant",
                            content=full_content,
                            citations=citations,
                            metadata={"mode": "universal", "tool_trace": tool_trace},
                        )
                    
                    # Track token usage
                    approx = estimate_tokens(user_message) + estimate_tokens(full_content) + 1000 # Add buffer for RAG context
                    ChatTokenUsage.objects.create(
                        team=session.team,
                        user=request.user,
                        session=session,
                        prompt_tokens=max(approx // 2, 1),
                        completion_tokens=max(approx // 2, 1),
                        total_tokens=approx,
                        metadata={"model": model_used, "mode": "universal"},
                    )

                if ChatMessage.objects.filter(session__team=session.team, role="assistant").count() == 1:
                    record_first_once(
                        event_name="first_chat_answer_received",
                        team=session.team,
                        user=request.user,
                        properties={"session_id": str(session.id), "mode": "universal"},
                    )
                
                yield f"event: done\ndata: {json.dumps({'status': 'done', 'mode': 'universal'})}\n\n"

            except Exception as e:
                logger.exception("Universal chat stream failed")
                yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"


        _stream_done = object()
        _heartbeat = object()

        def _queue_get_timed(q, timeout):
            try:
                return q.get(timeout=timeout)
            except queue.Empty:
                return _heartbeat

        async def async_event_stream():
            # ASGI needs a real async iterator (not sync generator). Run the sync generator
            # in a dedicated thread and multiplex timed reads to emit SSE keepalives.
            out_q = queue.Queue()

            def producer():
                try:
                    for line in event_stream():
                        out_q.put(line)
                except Exception:
                    logger.exception("Universal chat SSE producer thread failed")
                finally:
                    out_q.put(_stream_done)

            threading.Thread(
                target=producer,
                name="chat-universal-sse",
                daemon=True,
            ).start()

            yield ": connected\n\n"

            while True:
                chunk = await asyncio.to_thread(
                    _queue_get_timed, out_q, 18.0
                )
                if chunk is _stream_done:
                    break
                if chunk is _heartbeat:
                    yield ": keepalive\n\n"
                    continue
                yield chunk

        response = StreamingHttpResponse(async_event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

class AdminUsageStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, team_id):
        from accounts.models import TeamMember
        if not TeamMember.objects.filter(team_id=team_id, user=request.user, role="admin").exists():
            return fail("Admin access required", status_code=403)
            
        from django.db.models import Sum
        from chat.models import ChatTokenUsage
        
        # Aggregate by model
        usages = ChatTokenUsage.objects.filter(team_id=team_id).values("metadata__model").annotate(
            total_prompt=Sum("prompt_tokens"),
            total_completion=Sum("completion_tokens"),
            total=Sum("total_tokens")
        )
        
        data = []
        for u in usages:
            model_name = u.get("metadata__model", "unknown")
            data.append({
                "model": model_name,
                "prompt_tokens": u["total_prompt"] or 0,
                "completion_tokens": u["total_completion"] or 0,
                "total_tokens": u["total"] or 0,
            })
            
        return ok(data)


class ProactiveAlertsView(APIView):
    """GET /api/chat/:team_id/alerts/ — proactive alerts for the frontend banner."""

    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        from datetime import timedelta
        from django.utils import timezone
        from planning.models import Task, Milestone
        from wiki.models import WikiPage

        today = timezone.now().date()
        week_from_now = today + timedelta(days=7)
        alerts = []

        # Overdue tasks
        overdue = Task.objects.filter(
            project__team_id=team_id,
            end_date__lt=today,
            status__in=["todo", "in-progress"],
        ).select_related("project")[:5]

        for t in overdue:
            days = (today - t.end_date).days
            alerts.append({
                "id": f"overdue-{t.id}",
                "type": "overdue",
                "severity": "critical" if days > 7 else "warning",
                "message": f"'{t.title}' is {days} days overdue",
                "suggestedAction": f"Update the task status or adjust the deadline",
                "autoFixable": False,
                "createdAt": str(t.end_date),
            })

        # Approaching milestones
        approaching = Milestone.objects.filter(
            project__team_id=team_id,
            target_date__range=[today, week_from_now],
            status="pending",
        ).select_related("project")[:3]

        for m in approaching:
            alerts.append({
                "id": f"milestone-{m.id}",
                "type": "milestone_approaching",
                "severity": "info",
                "message": f"Milestone '{m.title}' is approaching ({m.target_date})",
                "suggestedAction": f"Review tasks for milestone completion",
                "autoFixable": False,
                "createdAt": str(m.target_date),
            })

        # Stale wiki pages
        stale = WikiPage.objects.filter(
            team_id=team_id,
            is_deleted=False,
            updated_at__lt=timezone.now() - timedelta(days=90),
        )[:3]

        for p in stale:
            alerts.append({
                "id": f"stale-{p.id}",
                "type": "stale_wiki",
                "severity": "warning",
                "message": f"Wiki page '{p.title}' hasn't been updated in 90+ days",
                "suggestedAction": f"Review and update or archive this page",
                "autoFixable": False,
                "createdAt": str(p.updated_at.date()),
            })

        return ok({"alerts": alerts})
