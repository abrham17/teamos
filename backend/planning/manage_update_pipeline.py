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
    def __init__(self, team: Team, user: User):
        self.team = team
        self.user = user

    def run(self, prompt: str, project_context: dict) -> Iterator[str]:
        yield _sse("agent_status", {"status": "Analyzing change scope..."})

        scope = self._extract_scope(prompt, project_context)
        yield _sse("agent_step", {"name": "plan_scope", "arguments": json.dumps(scope)})
        yield _sse("agent_result", {"name": "plan_scope", "ok": True, "result": scope})

        yield _sse("agent_status", {"status": "Generating targeted mutations..."})
        delta = self._generate_mutations(prompt, project_context, scope)
        mutations = delta.get("mutations", [])
        impact = delta.get("impact_summary", {})

        yield _sse("reasoning_done", {
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
        })

    def _extract_scope(self, prompt: str, project_context: dict) -> dict[str, Any]:
        system = (
            "You are a project change-scope analyst. Given a user request and existing project, "
            "identify what should change and what must NOT be replanned.\n"
            "Return JSON:\n"
            "  change_summary: string\n"
            "  affected_capabilities: [string]\n"
            "  out_of_scope: [string] (areas the user did NOT ask to change)\n"
            "  requires_new_tasks: boolean\n"
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
        )
        return result if isinstance(result, dict) else {}

    def _generate_mutations(
        self, prompt: str, project_context: dict, scope: dict[str, Any]
    ) -> dict[str, Any]:
        from django.utils import timezone

        today_str = timezone.now().strftime("%Y-%m-%d")
        system = (
            f"You are the TeamOS Plan Mutation Architect. Today is {today_str}.\n\n"
            "CRITICAL: Output ONLY targeted mutations — do NOT regenerate the full plan.\n"
            "Preserve existing entity IDs for updates. Use semantic_key for new entities.\n\n"
            "Return JSON:\n"
            "  mutations: [\n"
            "    {op: 'update', entity_type: 'task'|'milestone', id: 'uuid', fields: {...}},\n"
            "    {op: 'create', entity_type: 'task'|'milestone', semantic_key: 'hash', fields: {...}},\n"
            "    {op: 'delete', entity_type: 'task'|'milestone', id: 'uuid', reason: '...'},\n"
            "    {op: 'set_dependencies', task_id: 'uuid', depends_on: ['uuid', ...]},\n"
            "    {op: 'update_project', fields: {name?, description?}}\n"
            "  ]\n"
            "  impact_summary: {change_summary: string}\n\n"
            "Rules:\n"
            "- Only mutate items affected by the user request.\n"
            "- Do NOT delete tasks unless explicitly requested.\n"
            "- For new tasks set semantic_key (short stable slug) and fields with title, description, dates.\n"
            "- Use existing task/milestone ids from context for updates.\n"
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
        )
        if not isinstance(result, dict):
            return {"mutations": [], "impact_summary": {}}
        if "mutations" not in result:
            result["mutations"] = []
        return result
