"""
Manage-mode delta planning pipeline.

Stages:
  1. Scope / intent extraction
  2. Delta mutation generation
  3. Deterministic impact summary (also done in mutations.validate)
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from accounts.models import Team, User
from llm_orchestrator.orchestrator import llm_json_call

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class ManageUpdatePipeline:
    def __init__(self, team: Team, user: User, sse_queue: Optional[Any] = None):
        self.team = team
        self.user = user
        self.sse_queue = sse_queue

    def run(self, prompt: str, project_context: dict, chat_history: list[dict] | None = None) -> Iterator[str]:
        import queue
        import threading

        q = self.sse_queue or queue.Queue()
        self.sse_queue = q

        def worker():
            try:
                self._run_internal(prompt, project_context, chat_history, q)
            except Exception as e:
                logger.exception("Manage update pipeline worker failed")
                q.put(f"event: agent_error\ndata: {json.dumps({'detail': str(e)})}\n\n")
            finally:
                q.put(None)

        threading.Thread(target=worker, daemon=True).start()

        while True:
            item = q.get()
            if item is None:
                break
            yield item

    def _run_internal(
        self, prompt: str, project_context: dict, chat_history: list[dict] | None, q: Any
    ) -> None:
        q.put(_sse("agent_status", {"status": "Analyzing change scope..."}))

        # ── Interactive Questions Flow (Phase 2.5) ───────────────────
        from .history_helpers import (
            decide_clarifying_question,
            extract_answered_topics,
            consolidate_planning_prompt,
        )

        project_summary = (
            f"{project_context.get('task_count', 0)} tasks, "
            f"{project_context.get('milestone_count', 0)} milestones, "
            f"status={project_context.get('status', 'unknown')}"
        )
        risk_factors = (project_context.get("risk") or {}).get("factors", [])

        already_answered = extract_answered_topics(chat_history)
        question = decide_clarifying_question(
            prompt=prompt,
            chat_history=chat_history or [],
            team=self.team,
            mode="manage",
            project_summary=project_summary,
            risk_factors=risk_factors,
            already_answered_topics=already_answered,
        )
        if question:
            q.put(_sse("ask_user", question))
            return

        # Consolidate prompt with history context
        prompt = consolidate_planning_prompt(prompt, chat_history, self.team)

        scope = self._extract_scope(prompt, project_context)
        q.put(_sse("agent_step", {"name": "plan_scope", "arguments": json.dumps(scope)}))
        q.put(_sse("agent_result", {"name": "plan_scope", "ok": True, "result": scope}))

        q.put(_sse("agent_status", {"status": "Generating targeted mutations..."}))
        delta = self._generate_mutations(prompt, project_context, scope)
        mutations = delta.get("mutations", [])
        impact = delta.get("impact_summary", {})

        q.put(_sse("reasoning_done", {
            "mode": "manage",
            "mutations": mutations,
            "impact_summary": impact,
            "change_summary": scope.get("change_summary", ""),
            "affected_capabilities": scope.get("affected_capabilities", []),
            "out_of_scope": scope.get("out_of_scope", []),
            "projectName": project_context.get("name"),
            "description": project_context.get("description"),
            "tasks": [],
            "milestones": [],
            "members": [],
        }))

    def _extract_scope(self, prompt: str, project_context: dict) -> dict[str, Any]:
        system = (
            "ROLE: AI change-scope analyst.\n"
            "TASK: Identify plan updates and preserve unaffected segments.\n"
            "OUTPUT_SCHEMA:\n"
            "{\n"
            "  \"change_summary\": str,\n"
            "  \"affected_capabilities\": [str],\n"
            "  \"out_of_scope\": [str],\n"
            "  \"requires_new_tasks\": bool\n"
            "}"
        )
        user = (
            f"User request: {prompt}\n\n"
            f"Project summary: {project_context.get('name')} — "
            f"{project_context.get('task_count', 0)} tasks, "
            f"{project_context.get('milestone_count', 0)} milestones.\n"
            f"Capability index: {json.dumps(project_context.get('capability_index', {}), default=str)[:3000]}\n"
        )
        result = llm_json_call(
            team=self.team,
            operation="plan_manage_scope",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            default_on_error={
                "change_summary": prompt,
                "affected_capabilities": [],
                "out_of_scope": ["unaffected workstreams"],
                "requires_new_tasks": True,
            },
            sse_queue=self.sse_queue,
        )
        return result if isinstance(result, dict) else {}

    def _generate_mutations(
        self, prompt: str, project_context: dict, scope: dict[str, Any]
    ) -> dict[str, Any]:
        from django.utils import timezone

        today_str = timezone.now().strftime("%Y-%m-%d")
        system = (
            f"ROLE: AI plan mutation builder. Today: {today_str}.\n"
            "TASK: Output only targeted delta mutations, never regenerate the full plan.\n"
            "RULES:\n"
            "- preserve existing IDs for updates/deletes\n"
            "- define 'semantic_key' (stable slug) for new tasks\n"
            "- only mutate elements requested or directly blocked by the request\n"
            "OUTPUT_SCHEMA:\n"
            "{\n"
            "  \"mutations\": [\n"
            "    {\"op\": \"update\", \"entity_type\": \"task\"|\"milestone\", \"id\": str, \"fields\": dict},\n"
            "    {\"op\": \"create\", \"entity_type\": \"task\"|\"milestone\", \"semantic_key\": str, \"fields\": dict},\n"
            "    {\"op\": \"delete\", \"entity_type\": \"task\"|\"milestone\", \"id\": str, \"reason\": str},\n"
            "    {\"op\": \"set_dependencies\", \"task_id\": str, \"depends_on\": [str]},\n"
            "    {\"op\": \"update_project\", \"fields\": dict}\n"
            "  ],\n"
            "  \"impact_summary\": {\"change_summary\": str}\n"
            "}"
        )
        user = (
            f"User request: {prompt}\n\n"
            f"Scope analysis: {json.dumps(scope, default=str)}\n\n"
            f"Existing project (preserve IDs):\n"
            f"{json.dumps(project_context, default=str)}"
        )
        result = llm_json_call(
            team=self.team,
            operation="plan_manage_delta",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            default_on_error={"mutations": [], "impact_summary": {}},
            sse_queue=self.sse_queue,
        )
        if not isinstance(result, dict):
            return {"mutations": [], "impact_summary": {}}
        if "mutations" not in result:
            result["mutations"] = []
        return result
