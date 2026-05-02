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
from teamos_project.llm_config import chat_completion_model, get_llm_backend

logger = logging.getLogger(__name__)

TTS_MAX_CHARS = 4000
TTS_ALLOWED_VOICES = frozenset({"alloy", "echo", "fable", "onyx", "nova", "shimmer"})


def estimate_tokens(text: str) -> int:
    # Lightweight approximation: ~4 chars/token for English-like text.
    return max(1, len((text or "").strip()) // 4)


def _build_ask_system_prompt(context_str: str) -> str:
    """Strict RAG when team knowledge context exists; general assistant otherwise."""
    ctx = (context_str or "").strip()
    if not ctx:
        return (
            "You are the TeamOS AI. No team knowledge excerpts were retrieved for this question "
            "(wiki/planning knowledge may be empty, not yet indexed, or search is temporarily unavailable). "
            "Answer helpfully using your general knowledge. Begin by briefly noting that the answer is not sourced "
            "from this team's indexed knowledge. Do not invent source titles or slugs. "
            "Format answers in GitHub-flavored Markdown: use ### headings, bullet lists, and fenced code blocks "
            "for formulas or code."
        )
    return (
        "You are the TeamOS AI. Answer based ONLY on the provided team knowledge context. "
        "If the information is not in the context, say you don't know. "
        "Cite sources by using [Source Title]. "
        "If you find a contradiction, point it out. "
        "Format answers in GitHub-flavored Markdown: use ### headings, bullet lists, and fenced code "
        "blocks for formulas or code. "
        "When the context includes numeric, time-series, or tabular data (e.g. daily trading rows), "
        "summarize it in a Markdown pipe table with clear column headers; do not invent numbers. "
        "When a small chart would clarify trends and the values are in the context, add a diagram using "
        "a fenced code block with language tag `mermaid` (e.g. xychart-beta or a simple flowchart). "
        "Always close every ```mermaid block with ``` on its own line. "
        "Context:\n" + context_str
    )


def _retrieve_wiki_citations(team_id, user_message: str) -> tuple[list, str]:
    """Vector search → wiki + plan citation payloads + flattened context."""
    limit = int(getattr(settings, "CHAT_RAG_RESULT_LIMIT", 10) or 10)
    max_chars = int(getattr(settings, "CHAT_RAG_MAX_CONTEXT_CHARS", 5000) or 5000)

    try:
        results = vector_store.search_similar_pages(team_id, user_message, limit=limit)
    except Exception:
        logger.exception(
            "Wiki citation search failed (team_id=%s); continuing with empty context.",
            team_id,
        )
        return [], ""

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
        agent_ok = get_llm_backend() == "openai"
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
            if get_llm_backend() != "openai":
                return fail(
                    "Tool modes are unavailable for this deployment (requires OpenAI tool calling).",
                    status_code=503,
                    code="agent_backend_unavailable",
                )

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
                citations, context_str = _retrieve_wiki_citations(team_id, user_message)
                yield f"event: citations\ndata: {json.dumps({'citations': citations})}\n\n"
                yield f"event: status\ndata: {json.dumps({'status': 'Thinking...'})}\n\n"

                tool_trace_for_done: list = []

                if mode == "ask":
                    system_prompt = _build_ask_system_prompt(context_str)

                    history = [{"role": "system", "content": system_prompt}]
                    recent_messages = list(session.messages.order_by("-created_at")[:10])
                    for msg in reversed(recent_messages):
                        history.append({"role": msg.role, "content": msg.content})

                    llm = vector_store.openai
                    if not llm:
                        yield f"event: error\ndata: {json.dumps({'detail': 'Chat LLM is not configured (set GROQ_API_KEY for development or OPENAI_API_KEY for production).'})}\n\n"
                        return

                    model_name = chat_completion_model()
                    full_content = ""
                    stream = llm.chat.completions.create(
                        model=model_name,
                        messages=history,
                        stream=True,
                    )

                    for chunk in stream:
                        token = chunk.choices[0].delta.content or ""
                        if token:
                            full_content += token
                            yield f"event: chunk\ndata: {json.dumps({'token': token})}\n\n"

                    ChatMessage.objects.create(
                        session=session,
                        role="assistant",
                        content=full_content,
                        citations=citations,
                        metadata={"mode": "ask"},
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
                        metadata={"model": model_name, "mode": "ask"},
                    )
                else:
                    from chat.agent_stream import iter_agent_sse_events, iter_plan_agent_sse_events
                    from chat.tools import ToolContext

                    ctx = ToolContext(user=request.user, team_id=str(team_id), membership=membership)
                    agent_state: dict = {}
                    iterator = (
                        iter_plan_agent_sse_events if mode == "plan" else iter_agent_sse_events
                    )
                    for line in iterator(session, context_str, ctx, agent_state):
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
                            metadata={"mode": mode, "tool_trace": tool_trace},
                        )
                        model_name = chat_completion_model()
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
                            metadata={"model": model_name, "mode": mode},
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
