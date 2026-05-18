"""
Multi-Stage Reasoning Pipeline for Plan Generation.

New stage order (wiki-first, domain-synthesized):

  1. RESEARCH   — Search wiki using the chat's full retrieval stack
                  (multi-query expansion + HyDE + hybrid search + graph)
  2. SYNTHESIZE — LLM reads wiki results + prompt → derives domain,
                  expert persona, vocabulary, constraints, seed tasks
  3. DECOMPOSE  — Domain-aware sub-goal decomposition
  4. DRAFT      — Wiki-grounded, domain-expert plan generation
  5. CRITIQUE   — Domain-aware self-evaluation and revision
  6. FINALIZE   — Dependency inference + adaptive scheduling
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Iterator

from accounts.models import Team, User
from llm_orchestrator.orchestrator import llm_json_call

logger = logging.getLogger(__name__)


# ── Data Classes ──────────────────────────────────────────────────────

@dataclass
class WikiSnippet:
    source: str
    content: str
    score: float = 0.0
    page_id: str = ""
    match: str = "semantic"


@dataclass
class ResearchResult:
    snippets: list[WikiSnippet]          # flat list, best-first
    context_text: str                    # pre-formatted string for LLM consumption
    wiki_is_sparse: bool = False
    knowledge_gaps: list[str] = field(default_factory=list)
    expertise_map: dict[str, str] = field(default_factory=dict)


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
    score: int
    issues: list[dict[str, str]]
    revised_tasks: list[dict[str, Any]]
    revised_milestones: list[dict[str, Any]]
    suggestions: list[str] = field(default_factory=list)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ── Pipeline ──────────────────────────────────────────────────────────

class PlanningReasoningPipeline:
    """
    Wiki-first, domain-synthesized planning pipeline.

    The pipeline searches the wiki BEFORE doing anything else.
    The LLM then reads those results and synthesizes its own domain
    understanding — no hardcoded domain list needed.
    """

    def __init__(self, team: Team, user: User):
        self.team = team
        self.user = user
        self.team_id = str(team.id)
        self.domain_ctx = None   # Set during Stage 2

    def run(
        self,
        prompt: str,
        mode: str = "create",
        project_context: dict | None = None,
    ) -> Iterator[str]:

        # ── Stage 1: Research (wiki-first) ────────────────────────
        yield _sse("agent_status", {"status": "Searching wiki knowledge base..."})
        yield _sse("agent_step", {"name": "reasoning_research", "arguments": json.dumps({"query": prompt[:80]})})

        research = self._research(prompt)

        yield _sse("agent_result", {
            "name": "reasoning_research",
            "ok": True,
            "result": {
                "snippets_found": len(research.snippets),
                "wiki_sparse": research.wiki_is_sparse,
                "knowledge_gaps": research.knowledge_gaps[:3],
            },
        })

        # ── Stage 2: Synthesize Domain from wiki + prompt ─────────
        yield _sse("agent_status", {"status": "Synthesizing domain context from wiki knowledge..."})
        yield _sse("agent_step", {"name": "reasoning_synthesize", "arguments": "{}"})

        from planning.domain_classifier import synthesize_domain
        self.domain_ctx = synthesize_domain(prompt, research.context_text, self.team)

        yield _sse("agent_result", {
            "name": "reasoning_synthesize",
            "ok": True,
            "result": {
                "domain": self.domain_ctx.domain,
                "sub_domain": self.domain_ctx.sub_domain,
                "expert": self.domain_ctx.expert_persona[:100],
                "vocabulary_count": len(self.domain_ctx.task_vocabulary),
                "seed_tasks_available": len(self.domain_ctx.seed_tasks),
            },
        })

        # ── Stage 3: Decompose ────────────────────────────────────
        yield _sse("agent_status", {"status": f"Decomposing mission ({self.domain_ctx.sub_domain})..."})
        yield _sse("agent_step", {"name": "reasoning_decompose", "arguments": json.dumps({"prompt": prompt[:80]})})

        decomposition = self._decompose(prompt, mode, project_context, research)

        yield _sse("agent_result", {
            "name": "reasoning_decompose",
            "ok": True,
            "result": {
                "goal_count": len(decomposition.goals),
                "goals": [g.title for g in decomposition.goals],
                "constraints": decomposition.constraints[:3],
            },
        })

        # ── Stage 4: Draft ────────────────────────────────────────
        yield _sse("agent_status", {"status": "Drafting domain-specific plan..."})
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

        # ── Stage 5: Critique ─────────────────────────────────────
        yield _sse("agent_status", {"status": "Self-critiquing plan for domain coverage..."})
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

        if critique.revised_tasks:
            draft.tasks = critique.revised_tasks
        if critique.revised_milestones:
            draft.milestones = critique.revised_milestones

        # ── Stage 6: Finalize ─────────────────────────────────────
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

        yield _sse("agent_status", {"status": "Plan reasoning complete."})

        yield _sse("reasoning_done", {
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
            "domain": self.domain_ctx.domain,
            "sub_domain": self.domain_ctx.sub_domain,
        })

    # ── Stage Implementations ─────────────────────────────────────────

    def _research(self, prompt: str) -> ResearchResult:
        """
        Stage 1: Full wiki retrieval using the chat's 3-layer stack.

        1. expand_search_queries — LLM generates 3 query variants + HyDE
        2. search_wiki_pages(mode='hybrid') — semantic + keyword, score-deduped
        3. Graph expansion from high-score hits

        Returns a flat ranked list of WikiSnippets + a pre-formatted context string.
        """
        from chat.wiki_search import expand_search_queries, search_wiki_pages
        from graph_engine.traversal import traverse_neighbors

        # Step 1: Multi-query expansion + HyDE
        try:
            queries = expand_search_queries(prompt, self.team)
        except Exception:
            logger.warning("Query expansion failed, using raw prompt.")
            queries = [prompt]

        # Step 2: Hybrid search across all expanded queries
        snippets: list[WikiSnippet] = []
        seen_ids: set[str] = set()
        seen_page_ids_for_graph: set[str] = set()

        for query in queries[:4]:
            try:
                hits = search_wiki_pages(
                    self.team_id,
                    query,
                    limit=10,
                    mode="hybrid",
                    expand_queries=False,
                    team=self.team,
                )
                for hit in hits:
                    pid = hit["id"]
                    if pid in seen_ids:
                        continue
                    seen_ids.add(pid)
                    snippets.append(WikiSnippet(
                        source=hit["title"],
                        content=hit["snippet"],
                        score=hit["score"],
                        page_id=pid,
                        match=hit["match"],
                    ))

                    # Step 3: Graph expansion from high-confidence hits
                    if hit["score"] > 0.5 and pid not in seen_page_ids_for_graph:
                        seen_page_ids_for_graph.add(pid)
                        try:
                            neighbors = traverse_neighbors(
                                pid, self.team_id,
                                max_hops=1, include_content=True, max_results=3,
                            )
                            for n in neighbors:
                                npid = n["page_id"]
                                if npid not in seen_ids:
                                    seen_ids.add(npid)
                                    excerpt = n.get("content_excerpt", "")[:300]
                                    if excerpt:
                                        snippets.append(WikiSnippet(
                                            source=f"→ {n['title']}",
                                            content=excerpt,
                                            score=0.4,
                                            page_id=npid,
                                            match="graph",
                                        ))
                        except Exception:
                            pass
            except Exception:
                logger.exception("Wiki search failed for query: %s", query[:60])

        # Sort best-first, cap at 15
        snippets.sort(key=lambda s: -s.score)
        snippets = snippets[:15]

        # Build pre-formatted context string for LLM
        context_parts = [
            f"[{s.source}]: {s.content}"
            for s in snippets
        ]
        context_text = "\n\n".join(context_parts)

        # Knowledge gaps
        knowledge_gaps: list[str] = []
        try:
            from graph_engine.traversal import knowledge_gap_analysis
            gaps = knowledge_gap_analysis(self.team_id)
            knowledge_gaps = [c["title"] for c in gaps.get("orphan_concepts", [])[:5]]
        except Exception:
            pass

        # Team expertise map
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
            snippets=snippets,
            context_text=context_text,
            wiki_is_sparse=len(snippets) < 3,
            knowledge_gaps=knowledge_gaps,
            expertise_map=expertise_map,
        )

    def _decompose(
        self,
        prompt: str,
        mode: str,
        project_context: dict | None,
        research: ResearchResult,
    ) -> DecompositionResult:
        """Stage 3: Domain-aware decomposition using synthesized persona."""
        ctx = self.domain_ctx

        domain_block = ""
        if ctx and not ctx.is_general:
            vocab = ", ".join(ctx.task_vocabulary[:6])
            constraints = ", ".join(ctx.domain_constraints) or "None"
            domain_block = (
                f"{ctx.expert_persona}\n\n"
                f"Domain: {ctx.domain} / {ctx.sub_domain}\n"
                f"Technical vocabulary for sub-goals: {vocab}\n"
                f"Domain constraints to address: {constraints}\n\n"
            )

        system = (
            domain_block
            + "Decompose this project mission into SPECIFIC sub-goals.\n\n"
            "RULES:\n"
            "- Sub-goals must be domain-specific. Do NOT use generic phases.\n"
            "- BAD: 'Implement core features' | GOOD: 'Build KYC/AML verification pipeline'\n"
            "- BAD: 'Analyze requirements'    | GOOD: 'Define PCI-DSS compliance scope'\n"
            "- Each sub-goal = one concrete technical deliverable.\n"
            "- Use vocabulary from the wiki context where it appears.\n\n"
            "Return JSON: {goals: [{title, description, constraints, assumptions}], "
            "constraints: [string], assumptions: [string], scope_summary: string}"
        )

        user_content = f"Mission: {prompt}"
        if research.context_text:
            user_content += f"\n\nRelevant wiki context:\n{research.context_text[:3000]}"
        if mode == "manage" and project_context:
            user_content += f"\n\nExisting project: {json.dumps(project_context)[:2000]}"

        result = llm_json_call(
            team=self.team,
            operation="plan_decompose",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            default_on_error={
                "goals": [{"title": prompt[:80], "description": prompt,
                           "constraints": [], "assumptions": []}],
                "constraints": [], "assumptions": [], "scope_summary": prompt[:120],
            },
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

    def _draft(
        self,
        prompt: str,
        decomposition: DecompositionResult,
        research: ResearchResult,
        mode: str,
        project_context: dict | None,
    ) -> PlanDraft:
        """Stage 4: Generate plan grounded in wiki + synthesized domain expertise."""
        ctx = self.domain_ctx

        # Seed task fallback when wiki is sparse
        seed_block = ""
        if research.wiki_is_sparse and ctx and ctx.seed_tasks:
            seeds = ctx.seed_tasks[:8]
            seed_block = (
                "\n\nThe wiki has limited content for this project. "
                "Use your synthesized domain expertise. "
                "Example tasks for this domain (adapt to the specific project):\n"
                + "\n".join(f"- {t['title']}: {t.get('description', '')}" for t in seeds)
                + "\nGenerate tasks at this level of specificity.\n"
            )

        # Team expertise
        expertise_lines = [
            f"- User {uid}: expertise in {areas}"
            for uid, areas in research.expertise_map.items()
        ]
        expertise_text = "\n".join(expertise_lines) or "No expertise data available."

        # Domain persona block
        persona_block = ""
        if ctx and not ctx.is_general:
            vocab = ", ".join(ctx.task_vocabulary[:8])
            constraints = ", ".join(ctx.domain_constraints) or "None"
            persona_block = (
                f"{ctx.expert_persona}\n\n"
                f"Use this domain vocabulary in task titles: {vocab}\n"
                f"Ensure these constraints are addressed: {constraints}\n\n"
            )

        system = (
            persona_block
            + "You are the TeamOS Plan Architect. Generate a complete, specific project plan.\n\n"
            "CRITICAL RULES:\n"
            "- Task titles MUST be domain-specific and technical.\n"
            "- REJECTED: 'Implement features', 'Define requirements', 'Test the system'\n"
            "- REQUIRED: 'Build KYC/AML verification pipeline', 'Implement settlement engine'\n"
            "- Reference wiki pages with [[Page Title]] syntax in descriptions.\n"
            "- Add a 'reasoning' field to each task explaining why it exists.\n"
            "- Assign tasks using assignee_id from Team Expertise.\n"
            "- Every task needs startDate and endDate (YYYY-MM-DD).\n\n"
            "Return JSON:\n"
            "  projectName: string\n"
            "  description: string (markdown)\n"
            "  tasks: [{id, title, description, status, priority, startDate, endDate,"
            "           assignee_id, reasoning, wikiReferences: []}]\n"
            "  milestones: [{id, title, date, description, status}]\n"
            "  members: [{userId, role}]\n"
            "  reasoning_traces: [string]\n"
            "  wiki_references: [string]\n"
        )

        goals_text = "\n".join(
            f"- {g.title}: {g.description}"
            + (f" (constraints: {', '.join(g.constraints)})" if g.constraints else "")
            for g in decomposition.goals
        )

        user_content = (
            f"Mission: {prompt}\n\n"
            f"Sub-Goals:\n{goals_text}\n\n"
            f"Scope: {decomposition.scope_summary}\n"
            f"Constraints: {', '.join(decomposition.constraints) or 'None'}\n\n"
            f"Team Wiki Knowledge:\n{research.context_text or 'No wiki content found.'}\n\n"
            f"Team Expertise:\n{expertise_text}"
            + seed_block
        )

        if mode == "manage" and project_context:
            user_content += (
                "\n\nExisting Project (update only; preserve IDs):\n"
                + json.dumps(project_context, default=str)[:5000]
            )

        if research.knowledge_gaps:
            user_content += f"\n\nKnowledge Gaps: {', '.join(research.knowledge_gaps)}"

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
        """Stage 5: Domain-aware self-evaluation."""
        ctx = self.domain_ctx

        domain_criteria = ""
        if ctx and not ctx.is_general:
            domain_criteria = (
                f"\nDomain Evaluation ({ctx.domain}/{ctx.sub_domain}):\n"
                f"- Do tasks use domain vocabulary: {', '.join(ctx.task_vocabulary[:5])}?\n"
                f"- Are domain constraints addressed: {', '.join(ctx.domain_constraints)}?\n"
                f"- Any generic task titles that must be rewritten? "
                f"  (e.g. 'Define requirements', 'Implement features' → REJECTED)\n"
            )

        system = (
            "You are a senior project management reviewer. Evaluate this plan:\n"
            "1. Coverage: All sub-goals addressed?\n"
            "2. Realism: Timelines achievable?\n"
            "3. Dependencies: Task ordering logical?\n"
            "4. Risks: Missing contingencies?\n"
            "5. Completeness: Missing milestones, unclear ownership?\n"
            + domain_criteria
            + "\nReturn JSON:\n"
            "  score: 0-100\n"
            "  issues: [{type, description, severity: low|medium|high}]\n"
            "  revised_tasks: [...] (only if changes needed; preserve id, dates)\n"
            "  revised_milestones: [...] (only if changes needed)\n"
            "  suggestions: [string]\n"
        )

        goals_text = ", ".join(g.title for g in decomposition.goals)
        plan_json = json.dumps({
            "projectName": draft.project_name,
            "tasks": draft.tasks[:15],
            "milestones": draft.milestones[:8],
        })

        result = llm_json_call(
            team=self.team,
            operation="plan_critique",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Sub-goals: {goals_text}\n\nPlan:\n{plan_json}"},
            ],
            default_on_error={
                "score": 70, "issues": [], "revised_tasks": [],
                "revised_milestones": [], "suggestions": [],
            },
        )

        return CritiqueResult(
            score=result.get("score", 70),
            issues=result.get("issues", []),
            revised_tasks=result.get("revised_tasks", []),
            revised_milestones=result.get("revised_milestones", []),
            suggestions=result.get("suggestions", []),
        )

    def _finalize(self, draft: PlanDraft) -> PlanDraft:
        """Stage 6: Dependency inference + scheduling with domain patterns."""
        try:
            from planning.dependency_inference import infer_dependencies
            domain_patterns = (
                self.domain_ctx.dependency_patterns
                if self.domain_ctx and not self.domain_ctx.is_general
                else None
            )
            draft.tasks = infer_dependencies(draft.tasks, self.team_id, domain_patterns=domain_patterns)
        except Exception:
            logger.exception("Dependency inference failed")

        try:
            from planning.adaptive_scheduler import adjust_schedule
            draft.tasks = adjust_schedule(draft.tasks, self.team_id)
        except Exception:
            logger.exception("Adaptive scheduling failed")

        return draft
