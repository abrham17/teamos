"""
Multi-Stage Reasoning Pipeline for Plan Generation.

Instead of a single LLM call, this pipeline runs 5 stages:
1. DECOMPOSE — Break the mission into sub-goals and constraints
2. RESEARCH  — Deep wiki + graph context per sub-goal
3. DRAFT     — Generate plan with reasoning traces
4. CRITIQUE  — Self-evaluate and revise
5. FINALIZE  — Apply dependency inference + adaptive scheduling

Each stage yields SSE events so the frontend shows real progress.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Iterator

from accounts.models import Team, User
from ingest.vectors import vector_store
from llm_orchestrator.orchestrator import llm_call, llm_json_call

logger = logging.getLogger(__name__)


# ── Data Classes ──────────────────────────────────────────────────────


@dataclass
class Goal:
    title: str
    description: str
    constraints: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)


@dataclass
class DecompositionResult:
    goals: list[Goal]
    constraints: list[str]
    assumptions: list[str]
    scope_summary: str = ""


@dataclass
class ResearchResult:
    context_per_goal: dict[str, list[str]]  # goal_title -> context snippets
    knowledge_gaps: list[str] = field(default_factory=list)
    related_projects: list[str] = field(default_factory=list)
    expertise_map: dict[str, str] = field(default_factory=dict)  # user_id -> areas


@dataclass
class PlanDraft:
    project_name: str
    description: str
    tasks: list[dict[str, Any]]
    milestones: list[dict[str, Any]]
    members: list[dict[str, Any]] = field(default_factory=list)
    reasoning_traces: list[str] = field(default_factory=list)
    wiki_references: list[str] = field(default_factory=list)
    knowledge_gaps: list[str] = field(default_factory=list)


@dataclass
class CritiqueResult:
    score: int  # 0-100
    issues: list[dict[str, str]]  # [{type, description, severity}]
    revised_tasks: list[dict[str, Any]]
    revised_milestones: list[dict[str, Any]]
    suggestions: list[str] = field(default_factory=list)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ── Pipeline ──────────────────────────────────────────────────────────


class PlanningReasoningPipeline:
    """
    Multi-stage reasoning pipeline for high-quality plan generation.

    Yields SSE events at each stage for real-time frontend feedback.
    """

    def __init__(self, team: Team, user: User):
        self.team = team
        self.user = user
        self.team_id = str(team.id)

    def run(
        self,
        prompt: str,
        mode: str = "create",
        project_context: dict | None = None,
    ) -> Iterator[str]:
        """
        Execute the full pipeline, yielding SSE events.

        Returns the final PlanDraft via the agent_done event.
        """
        # ── Stage 1: Decompose ────────────────────────────────────
        yield _sse("agent_status", {"status": "Decomposing mission into sub-goals..."})
        yield _sse("agent_step", {"name": "reasoning_decompose", "arguments": json.dumps({"prompt": prompt[:100]})})

        decomposition = self._decompose(prompt, mode, project_context)

        yield _sse("agent_result", {
            "name": "reasoning_decompose",
            "ok": True,
            "result": {
                "goal_count": len(decomposition.goals),
                "goals": [g.title for g in decomposition.goals],
                "constraints": decomposition.constraints[:3],
            },
        })

        # ── Stage 2: Research ─────────────────────────────────────
        yield _sse("agent_status", {"status": "Researching wiki knowledge per sub-goal..."})
        yield _sse("agent_step", {"name": "reasoning_research", "arguments": json.dumps({"goals": len(decomposition.goals)})})

        research = self._research(decomposition)

        yield _sse("agent_result", {
            "name": "reasoning_research",
            "ok": True,
            "result": {
                "sources_found": sum(len(v) for v in research.context_per_goal.values()),
                "knowledge_gaps": research.knowledge_gaps[:3],
                "related_projects": research.related_projects[:3],
            },
        })

        # ── Stage 3: Draft ────────────────────────────────────────
        yield _sse("agent_status", {"status": "Drafting plan with reasoning traces..."})
        yield _sse("agent_step", {"name": "reasoning_draft", "arguments": json.dumps({"mode": mode})})

        draft = self._draft(prompt, decomposition, research, mode, project_context)

        yield _sse("agent_result", {
            "name": "reasoning_draft",
            "ok": True,
            "result": {
                "task_count": len(draft.tasks),
                "milestone_count": len(draft.milestones),
                "project_name": draft.project_name,
            },
        })

        # ── Stage 4: Critique ─────────────────────────────────────
        yield _sse("agent_status", {"status": "Self-critiquing plan for issues..."})
        yield _sse("agent_step", {"name": "reasoning_critique", "arguments": json.dumps({"task_count": len(draft.tasks)})})

        critique = self._critique(draft, decomposition)

        yield _sse("agent_result", {
            "name": "reasoning_critique",
            "ok": True,
            "result": {
                "score": critique.score,
                "issues_found": len(critique.issues),
                "suggestions": critique.suggestions[:3],
            },
        })

        # Apply revisions if critique found issues
        if critique.revised_tasks:
            draft.tasks = critique.revised_tasks
        if critique.revised_milestones:
            draft.milestones = critique.revised_milestones

        # ── Stage 5: Finalize (dependency + scheduling) ───────────
        yield _sse("agent_status", {"status": "Inferring dependencies and scheduling..."})
        yield _sse("agent_step", {"name": "reasoning_finalize", "arguments": "{}"})

        draft = self._finalize(draft)

        yield _sse("agent_result", {
            "name": "reasoning_finalize",
            "ok": True,
            "result": {
                "dependencies_inferred": sum(1 for t in draft.tasks if t.get("dependency_ids")),
                "tasks_scheduled": sum(1 for t in draft.tasks if t.get("start_date")),
            },
        })

        # ── Emit final plan as structured dict ────────────────────
        yield _sse("agent_status", {"status": "Plan reasoning complete."})

        # Return the full draft as JSON for the caller to process
        final_data = {
            "projectName": draft.project_name,
            "description": draft.description,
            "tasks": draft.tasks,
            "milestones": draft.milestones,
            "members": draft.members,
            "knowledge_gaps": draft.knowledge_gaps,
            "wiki_references": draft.wiki_references,
            "reasoning_traces": draft.reasoning_traces,
            "critique_score": critique.score,
            "critique_suggestions": critique.suggestions,
        }
        yield _sse("reasoning_done", final_data)

    # ── Stage Implementations ─────────────────────────────────────────

    def _decompose(
        self,
        prompt: str,
        mode: str,
        project_context: dict | None,
    ) -> DecompositionResult:
        """Stage 1: Break mission into sub-goals."""
        system = (
            "You are a strategic planning analyst. Given a project mission, decompose it into:\n"
            "1. Sub-goals (2-6 concrete objectives)\n"
            "2. Constraints (limitations, deadlines, resources)\n"
            "3. Assumptions (what we're taking for granted)\n"
            "4. scope_summary (1-sentence scope definition)\n\n"
            "Return JSON: {goals: [{title, description, constraints, assumptions}], "
            "constraints: [string], assumptions: [string], scope_summary: string}"
        )
        user_content = f"Mission: {prompt}"
        if mode == "manage" and project_context:
            user_content += f"\n\nExisting project context: {json.dumps(project_context)[:2000]}"

        result = llm_json_call(
            team=self.team,
            operation="plan_decompose",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            default_on_error={"goals": [{"title": prompt[:80], "description": prompt, "constraints": [], "assumptions": []}], "constraints": [], "assumptions": [], "scope_summary": prompt[:120]},
        )

        goals = [
            Goal(
                title=g.get("title", "Goal"),
                description=g.get("description", ""),
                constraints=g.get("constraints", []),
                assumptions=g.get("assumptions", []),
            )
            for g in result.get("goals", [])
        ]

        return DecompositionResult(
            goals=goals or [Goal(title=prompt[:80], description=prompt)],
            constraints=result.get("constraints", []),
            assumptions=result.get("assumptions", []),
            scope_summary=result.get("scope_summary", ""),
        )

    def _research(self, decomposition: DecompositionResult) -> ResearchResult:
        """Stage 2: Deep wiki + graph context per sub-goal."""
        from graph_engine.traversal import traverse_neighbors

        context_per_goal: dict[str, list[str]] = {}
        all_knowledge_gaps: list[str] = []
        related_projects: list[str] = []
        seen_page_ids: set[str] = set()

        for goal in decomposition.goals:
            query = f"{goal.title}: {goal.description}"
            snippets: list[str] = []

            # Vector search
            try:
                results = vector_store.search_similar_pages(self.team_id, query, limit=5)
                for res in results:
                    source = res.payload.get("page_title") or res.payload.get("project_name") or "Knowledge"
                    content = res.payload.get("content", "")[:400]
                    snippets.append(f"[{source}]: {content}")

                    # Check for related projects
                    if res.payload.get("project_name"):
                        pname = res.payload["project_name"]
                        if pname not in related_projects:
                            related_projects.append(pname)

                    # Graph expansion from top results
                    pid = res.payload.get("page_id")
                    if pid and pid not in seen_page_ids:
                        seen_page_ids.add(pid)
                        try:
                            neighbors = traverse_neighbors(
                                pid, self.team_id, max_hops=1, include_content=True, max_results=3
                            )
                            for n in neighbors:
                                if n["page_id"] not in seen_page_ids:
                                    seen_page_ids.add(n["page_id"])
                                    excerpt = n.get("content_excerpt", "")[:200]
                                    if excerpt:
                                        snippets.append(f"[Graph→ {n['title']}]: {excerpt}")
                        except Exception:
                            pass
            except Exception:
                logger.exception("Research vector search failed for goal: %s", goal.title)

            context_per_goal[goal.title] = snippets

        # Knowledge gap analysis
        try:
            from graph_engine.traversal import knowledge_gap_analysis
            gaps = knowledge_gap_analysis(self.team_id)
            all_knowledge_gaps = gaps.get("orphan_concepts", [])[:5]
        except Exception:
            pass

        # Team expertise mapping
        expertise_map: dict[str, str] = {}
        try:
            from accounts.models import TeamMember
            from wiki.models import WikiPage

            members = TeamMember.objects.filter(team=self.team).select_related("user")
            for tm in members:
                pages = WikiPage.objects.filter(
                    team=self.team, created_by=tm.user, is_deleted=False
                ).values_list("title", flat=True)[:5]
                expertise_map[str(tm.user.id)] = ", ".join(pages) if pages else "General"
        except Exception:
            pass

        return ResearchResult(
            context_per_goal=context_per_goal,
            knowledge_gaps=all_knowledge_gaps,
            related_projects=related_projects,
            expertise_map=expertise_map,
        )

    def _draft(
        self,
        prompt: str,
        decomposition: DecompositionResult,
        research: ResearchResult,
        mode: str,
        project_context: dict | None,
    ) -> PlanDraft:
        """Stage 3: Generate plan with reasoning traces."""
        # Build context from research
        context_parts = []
        for goal_title, snippets in research.context_per_goal.items():
            if snippets:
                context_parts.append(f"## Context for: {goal_title}")
                context_parts.extend(snippets[:4])

        context_text = "\n\n".join(context_parts)

        # Build expertise context
        expertise_lines = [
            f"- User {uid}: expertise in {areas}"
            for uid, areas in research.expertise_map.items()
        ]
        expertise_text = "\n".join(expertise_lines) if expertise_lines else "No expertise data available."

        system = (
            "You are the TeamOS Plan Architect with deep wiki knowledge access.\n"
            "Generate a detailed project plan grounded in the team's existing knowledge.\n\n"
            "IMPORTANT RULES:\n"
            "- Reference specific wiki pages using [[Page Title]] syntax in task descriptions.\n"
            "- For EACH task, add a 'reasoning' field explaining WHY this task, priority, and deadline.\n"
            "- Assign tasks to team members based on their expertise.\n"
            "- Tasks should cover ALL sub-goals from the decomposition.\n\n"
            "Return JSON with:\n"
            "  projectName: string\n"
            "  description: string (markdown, reference [[wiki pages]])\n"
            "  tasks: [{title, description, status, priority, startDate, endDate, assignee_id, reasoning, wikiReferences: []}]\n"
            "  milestones: [{title, date, description, status}]\n"
            "  members: [{userId, role}]\n"
            "  reasoning_traces: [string] (key decisions explained)\n"
            "  wiki_references: [string] (all wiki pages referenced)\n"
        )

        goals_text = "\n".join([
            f"- {g.title}: {g.description}" + (f" (constraints: {', '.join(g.constraints)})" if g.constraints else "")
            for g in decomposition.goals
        ])

        user_content = (
            f"Mission: {prompt}\n\n"
            f"Decomposed Sub-Goals:\n{goals_text}\n\n"
            f"Scope: {decomposition.scope_summary}\n"
            f"Constraints: {', '.join(decomposition.constraints) or 'None specified'}\n\n"
            f"Team Knowledge Context:\n{context_text}\n\n"
            f"Team Expertise:\n{expertise_text}\n\n"
        )

        if mode == "manage" and project_context:
            user_content += f"Existing Project: {json.dumps(project_context)[:2000]}\n"

        if research.knowledge_gaps:
            user_content += f"\nKnowledge Gaps (topics not documented): {', '.join(research.knowledge_gaps)}\n"

        result = llm_json_call(
            team=self.team,
            operation="plan_generate",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            default_on_error={},
        )

        if not result:
            raise ValueError("Plan draft generation returned empty result.")

        return PlanDraft(
            project_name=result.get("projectName", "New Project"),
            description=result.get("description", ""),
            tasks=result.get("tasks", []),
            milestones=result.get("milestones", []),
            members=result.get("members", []),
            reasoning_traces=result.get("reasoning_traces", []),
            wiki_references=result.get("wiki_references", []),
            knowledge_gaps=research.knowledge_gaps,
        )

    def _critique(self, draft: PlanDraft, decomposition: DecompositionResult) -> CritiqueResult:
        """Stage 4: Self-evaluate the plan and suggest revisions."""
        system = (
            "You are a senior project management reviewer. Evaluate this plan for:\n"
            "1. Coverage: Does it address ALL sub-goals?\n"
            "2. Realism: Are timelines achievable? Are there resource conflicts?\n"
            "3. Dependencies: Are task orderings logical?\n"
            "4. Risks: Missing contingencies? Single points of failure?\n"
            "5. Completeness: Missing milestones, unclear ownership?\n\n"
            "Return JSON:\n"
            "  score: 0-100 (overall quality)\n"
            "  issues: [{type: 'coverage'|'realism'|'dependency'|'risk'|'completeness', description, severity: 'low'|'medium'|'high'}]\n"
            "  revised_tasks: [...] (return ONLY if changes needed, otherwise empty array)\n"
            "  revised_milestones: [...] (return ONLY if changes needed, otherwise empty array)\n"
            "  suggestions: [string] (improvement recommendations)\n"
        )

        goals_text = ", ".join([g.title for g in decomposition.goals])
        plan_summary = json.dumps({
            "projectName": draft.project_name,
            "tasks": draft.tasks[:15],  # Limit to avoid token overflow
            "milestones": draft.milestones[:8],
        })

        user_content = (
            f"Sub-goals to cover: {goals_text}\n\n"
            f"Plan to review:\n{plan_summary}\n"
        )

        result = llm_json_call(
            team=self.team,
            operation="plan_critique",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            default_on_error={"score": 70, "issues": [], "revised_tasks": [], "revised_milestones": [], "suggestions": []},
        )

        return CritiqueResult(
            score=result.get("score", 70),
            issues=result.get("issues", []),
            revised_tasks=result.get("revised_tasks", []),
            revised_milestones=result.get("revised_milestones", []),
            suggestions=result.get("suggestions", []),
        )

    def _finalize(self, draft: PlanDraft) -> PlanDraft:
        """Stage 5: Apply dependency inference and adaptive scheduling."""
        try:
            from planning.dependency_inference import infer_dependencies
            draft.tasks = infer_dependencies(draft.tasks, self.team_id)
        except Exception:
            logger.exception("Dependency inference failed during finalization")

        try:
            from planning.adaptive_scheduler import adjust_schedule
            draft.tasks = adjust_schedule(draft.tasks, self.team_id)
        except Exception:
            logger.exception("Adaptive scheduling failed during finalization")

        return draft
