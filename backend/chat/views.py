import json
import logging

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
from llm_orchestrator.orchestrator import llm_call

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
        "INFERENCE RULE: If the answer is not literal, use the provided context to INFER the answer through semantic connection. "
        "Connect related concepts across different source snippets to provide a comprehensive explanation. "
        "STRICT RULE: If no logical inference can be made from the context, state that the information is missing. "
        "Never use outside knowledge. "
        "CITATION RULE: Cite sources as [Source Title]. "
        "Format in GitHub Markdown with ### headings and tables for data. "
        "Use Mermaid diagrams for workflows. "
        "Context:\n" + context_str
    )


def _retrieve_wiki_citations(team_id, user_message: str, team_obj=None) -> tuple[list, str]:
    """
    Multi-query expansion → Vector search → wiki + plan citation payloads.
    Generates multiple variations of the query to ensure deep semantic coverage.
    """
    limit = int(getattr(settings, "CHAT_RAG_RESULT_LIMIT", 10) or 10)
    max_chars = int(getattr(settings, "CHAT_RAG_MAX_CONTEXT_CHARS", 5000) or 5000)

    # 1. Query Expansion & HyDE (Deep Semantics)
    search_queries = [user_message]
    if team_obj:
        try:
            # Multi-query generation
            expansion_prompt = (
                f"Given the user query: '{user_message}', generate 3 diverse search queries that capture the underlying "
                f"intent and semantic meaning, even if they use different words. "
                f"Return as a simple JSON list of strings."
            )
            expanded = llm_json_call(
                team=team_obj,
                operation="query_expansion",
                messages=[{"role": "user", "content": expansion_prompt}],
                default_on_error=[]
            )
            if isinstance(expanded, list):
                search_queries.extend(expanded[:3])
            
            # HyDE: Hypothetical Document Embedding
            hyde_prompt = (
                f"Write a short, professional paragraph that would perfectly answer the query: '{user_message}'. "
                f"Focus on factual, relevant technical or team information."
            )
            hyde_answer, _, _ = llm_call(
                team=team_obj,
                operation="hyde_generation",
                messages=[{"role": "user", "content": hyde_prompt}],
            )
            if hyde_answer:
                search_queries.append(hyde_answer)
                
        except Exception:
            logger.warning("Query expansion/HyDE failed, falling back to original query.")

    all_results = []
    seen_ids = set()

    try:
        for q in search_queries:
            # Fetch more for broader coverage, then we'll deduplicate
            results = vector_store.search_similar_pages(team_id, q, limit=limit)
            for res in results:
                if res.id not in seen_ids:
                    all_results.append(res)
                    seen_ids.add(res.id)
    except Exception:
        logger.exception("Wiki citation search failed (team_id=%s)", team_id)
        return [], ""

    # Sort all expanded results by score
    all_results.sort(key=lambda x: x.score, reverse=True)
    results = all_results[:limit]

    citations = []
    context_blocks = []
    for res in results:
        payload = res.payload or {}
        source_type = payload.get("source_type") or "wiki"
        snippet = payload.get("content", "")
        chunk_id = payload.get("chunk_id")

        if source_type == "plan":
            project_id = payload.get("project_id")
            project_name = payload.get("project_name", "Untitled Project")
            source_kind = payload.get("source_kind", "project")
            source_ref_id = payload.get("source_ref_id")
            title = payload.get("title") or f"{source_kind.title()} — {project_name}"

            citations.append(
                {
                    "source": "plan",
                    "project_id": project_id,
                    "project_name": project_name,
                    "source_kind": source_kind,
                    "source_ref_id": source_ref_id,
                    "title": title,
                    "snippet": snippet[:200],
                    "score": float(res.score),
                    "chunk_id": chunk_id,
                }
            )
            context_blocks.append(
                f"SOURCE: {title} (Plan: {project_name})\nCONTENT: {snippet}"
            )
            continue

        page_id = payload.get("page_id")
        title = payload.get("page_title", "Untitled")
        anchor_hint = payload.get("heading") or payload.get("section") or ""
        slug = "unknown"
        try:
            if page_id:
                p = WikiPage.objects.only("slug").get(id=page_id)
                slug = p.slug
        except Exception:
            pass

        citations.append(
            {
                "source": "wiki",
                "page_id": page_id,
                "page_title": title,
                "page_slug": slug,
                "snippet": snippet[:200],
                "score": float(res.score),
                "chunk_id": chunk_id,
                "anchor_hint": anchor_hint,
            }
        )
        context_blocks.append(f"SOURCE: {title}\nCONTENT: {snippet}")

    # Drop lowest-ranked tail chunks until under character budget (results are best-first).
    while context_blocks:
        candidate = "\n\n".join(context_blocks)
        if len(candidate) <= max_chars:
            break
        if len(context_blocks) > 1:
            context_blocks.pop()
            citations.pop()
        else:
            block = context_blocks[0]
            sep = "\nCONTENT: "
            idx = block.find(sep)
            if idx == -1:
                context_blocks[0] = block[:max_chars]
            else:
                head = block[: idx + len(sep)]
                body = block[idx + len(sep) :]
                keep = max(0, max_chars - len(head))
                context_blocks[0] = head + body[:keep]
                citations[0]["snippet"] = body[: min(200, keep)]
            break

    context_str = "\n\n".join(context_blocks)
    if len(context_str) > max_chars:
        context_str = context_str[:max_chars]
    return citations, context_str


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
            yield f"event: status\ndata: {json.dumps({'status': 'Searching team knowledge...'})}\n\n"

            try:
                citations, context_str = _retrieve_wiki_citations(team_id, user_message, team_obj=session.team)
                yield f"event: citations\ndata: {json.dumps({'citations': citations})}\n\n"
                yield f"event: status\ndata: {json.dumps({'status': 'Thinking...'})}\n\n"

                tool_trace_for_done: list = []

                # Route to correct agent path based on mode
                from chat.agent_stream import iter_agent_core_events, iter_plan_agent_core_events
                from chat.tools import ToolContext

                ctx = ToolContext(user=request.user, team_id=str(team_id), membership=membership)
                agent_state: dict = {}

                if mode == "plan":
                    for line in iter_plan_agent_core_events(session, context_str, ctx, agent_state):
                        yield line
                else:
                    for line in iter_agent_core_events(session, context_str, ctx, agent_state):
                        yield line

                if agent_state.get("ok"):
                    full_content = agent_state.get("full_text") or ""
                    tool_trace = agent_state.get("tool_trace") or []
                    tool_trace_for_done = list(tool_trace)
                    ChatMessage.objects.create(
                        session=session,
                        role="assistant",
                        content=full_content,
                        citations=citations,
                        metadata={"mode": "agent", "tool_trace": tool_trace},
                    )
                    model_used = agent_state.get("model_used", "gpt-4o")
                    approx = estimate_tokens(context_str) + estimate_tokens(user_message) + estimate_tokens(
                        json.dumps(tool_trace)
                    ) + estimate_tokens(full_content)
                    ChatTokenUsage.objects.create(
                        team=session.team,
                        user=request.user,
                        session=session,
                        prompt_tokens=max(approx // 2, 1),
                        completion_tokens=max(approx // 2, 1),
                        total_tokens=approx,
                        metadata={"model": model_used, "mode": "agent"},
                    )

                if ChatMessage.objects.filter(session__team=session.team, role="assistant").count() == 1:
                    record_first_once(
                        event_name="first_chat_answer_received",
                        team=session.team,
                        user=request.user,
                        properties={"session_id": str(session.id), "mode": mode},
                    )
                yield f"event: done\ndata: {json.dumps({'status': 'done', 'mode': mode, 'tool_trace': tool_trace_for_done})}\n\n"

            except Exception as e:
                logger.error("Chat stream failed: %s", e)
                yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
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
