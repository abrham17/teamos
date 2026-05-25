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

        # ── Stage 3 & 4: Combined Decompose & Draft (Phase 5.1 & Speculative Strategy branching) ───
        yield _sse("agent_status", {"status": f"Speculatively decomposing and drafting alternative plans ({self.domain_ctx.sub_domain})..."})
        yield _sse("agent_step", {"name": "reasoning_decompose", "arguments": json.dumps({"strategies": ["fast_track", "risk_mitigated"]})})

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_fast = executor.submit(self._decompose_and_draft, prompt, mode, project_context, research, "fast_track")
            future_risk = executor.submit(self._decompose_and_draft, prompt, mode, project_context, research, "risk_mitigated")
            
            try:
                fast_decomp, fast_draft = future_fast.result()
            except Exception as e:
                logger.exception("Fast-track strategy generation failed")
                # Fallback: run balanced sequentially
                fast_decomp, fast_draft = self._decompose_and_draft(prompt, mode, project_context, research, "balanced")
                
            try:
                risk_decomp, risk_draft = future_risk.result()
            except Exception as e:
                logger.exception("Risk-mitigated strategy generation failed")
                # Fallback to copy fast
                risk_decomp, risk_draft = fast_decomp, fast_draft

        yield _sse("agent_result", {
            "name": "reasoning_decompose",
            "ok": True,
            "result": {
                "fast_track_goals": len(fast_decomp.goals),
                "risk_mitigated_goals": len(risk_decomp.goals),
                "constraints_analyzed": len(fast_decomp.constraints) + len(risk_decomp.constraints),
            },
        })

        yield _sse("agent_step", {"name": "reasoning_draft", "arguments": json.dumps({"mode": mode})})
        yield _sse("agent_result", {
            "name": "reasoning_draft",
            "ok": True,
            "result": {
                "candidates_generated": 2,
                "fast_track_tasks": len(fast_draft.tasks),
                "risk_mitigated_tasks": len(risk_draft.tasks),
            },
        })

        # ── Stage 5: Critique & Path Evaluation Selection ──────────
        yield _sse("agent_status", {"status": "Evaluating alternative paths and self-critiquing..."})
        yield _sse("agent_step", {"name": "reasoning_critique", "arguments": json.dumps({"candidates": ["fast_track", "risk_mitigated"]})})

        strategy_choice, draft, decomposition, critique = self._evaluate_and_select(
            fast_decomp, fast_draft, risk_decomp, risk_draft
        )

        yield _sse("agent_result", {
            "name": "reasoning_critique",
            "ok": True,
            "result": {
                "selected_strategy": strategy_choice,
                "score": critique.score,
                "issues_found": len(critique.issues),
                "suggestions": critique.suggestions[:3],
            },
        })

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

    def _decompose_and_draft(
        self,
        prompt: str,
        mode: str,
        project_context: dict | None,
        research: ResearchResult,
        strategy: str = "balanced",
    ) -> tuple[DecompositionResult, PlanDraft]:
        """Combine decomposition and drafting stages into a single call (Phase 5.1). Supports strategy branching."""
        ctx = self.domain_ctx

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

        expertise_lines = [
            f"- User {uid}: expertise in {areas}"
            for uid, areas in research.expertise_map.items()
        ]
        expertise_text = "\n".join(expertise_lines) or "No expertise data available."

        persona_block = ""
        if ctx and not ctx.is_general:
            vocab = ", ".join(ctx.task_vocabulary[:8])
            constraints = ", ".join(ctx.domain_constraints) or "None"
            persona_block = (
                f"{ctx.expert_persona}\n\n"
                f"Domain: {ctx.domain} / {ctx.sub_domain}\n"
                f"Use this domain vocabulary in task titles: {vocab}\n"
                f"Ensure these constraints are addressed: {constraints}\n\n"
            )

        from django.utils import timezone
        today_str = timezone.now().strftime("%A, %B %d, %Y")

        strategy_block = ""
        if strategy == "fast_track":
            strategy_block = (
                "\nCRITICAL STRATEGY (FAST-TRACK DELIVERY):\n"
                "- Design the plan for maximum concurrency. Avoid unnecessary task blocking.\n"
                "- Focus on quick delivery of core MVP deliverables. Omit elaborate testing phases.\n"
                "- Set start/end dates that reflect an aggressive, rapid sprint lifecycle.\n\n"
            )
        elif strategy == "risk_mitigated":
            strategy_block = (
                "\nCRITICAL STRATEGY (RISK-MITIGATED ROBUSTNESS):\n"
                "- Add mandatory code review, QA sign-off, and end-to-end testing tasks for critical deliverables.\n"
                "- Focus heavily on stability, error logging, and post-deployment validation.\n"
                "- Provide safe, generous schedule ranges with buffer time built-in.\n\n"
            )

        system = (
            persona_block
            + f"You are the TeamOS Plan Architect. Today is {today_str}.\n\n"
            + strategy_block
            + "First, decompose this project mission into SPECIFIC, domain-specific sub-goals.\n"
            "Sub-goals must be technical and concrete (not generic phases).\n"
            "Then, generate a grounded project plan details to achieve those goals.\n\n"
            "CRITICAL RULES:\n"
            "- Task titles MUST be domain-specific and technical.\n"
            "- REJECTED: 'Implement features', 'Define requirements', 'Test the system'\n"
            "- REQUIRED: 'Build KYC/AML verification pipeline', 'Implement settlement engine'\n"
            "- Reference wiki pages with [[Page Title]] syntax in descriptions.\n"
            "- Add a 'reasoning' field to each task explaining why it exists.\n"
            "- Assign tasks using assignee_id from Team Expertise.\n"
            f"- Every task needs startDate and endDate (YYYY-MM-DD) starting on or after today ({today_str}).\n"
            "CRITICAL DATE RULE: All dates MUST use the current year. Any date before 2026-05-01 is INVALID and will be rejected. "
            "Use ONLY dates in 2026 or later. Never generate dates in 2023, 2024, or early 2025.\n\n"
            "Return JSON:\n"
            "  goals: [{title, description, constraints, assumptions}]\n"
            "  scope_summary: string\n"
            "  projectName: string\n"
            "  description: string (markdown)\n"
            "  tasks: [{id, title, description, status, priority, startDate, endDate,"
            "           assignee_id, reasoning, wikiReferences: []}]\n"
            "  milestones: [{id, title, date, description, status}]\n"
            "  members: [{userId, role}]\n"
            "  reasoning_traces: [string]\n"
            "  wiki_references: [string]\n"
        )

        user_content = (
            f"Mission: {prompt}\n\n"
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
            operation=f"plan_decompose_and_generate_{strategy}",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            default_on_error={},
        )

        if not result:
            raise ValueError(f"Plan draft generation returned empty result for {strategy}.")

        # Reconstruct DecompositionResult
        goals = [
            Goal(
                title=g.get("title", "Goal"),
                description=g.get("description", ""),
                constraints=g.get("constraints", []),
                assumptions=g.get("assumptions", []),
            )
            for g in result.get("goals", [])
        ]
        decomposition = DecompositionResult(
            goals=goals or [Goal(title=prompt[:80], description=prompt)],
            constraints=result.get("constraints", []),
            assumptions=result.get("assumptions", []),
            scope_summary=result.get("scope_summary", ""),
        )

        # Reconstruct PlanDraft
        draft = PlanDraft(
            project_name=result.get("projectName", "New Project"),
            description=result.get("description", ""),
            tasks=result.get("tasks", []),
            milestones=result.get("milestones", []),
            members=result.get("members", []),
            reasoning_traces=result.get("reasoning_traces", []),
            wiki_references=result.get("wiki_references", []),
            knowledge_gaps=research.knowledge_gaps,
        )

        return decomposition, draft

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

        from django.utils import timezone
        today_str = timezone.now().strftime("%A, %B %d, %Y")

        system = (
            domain_block
            + f"Decompose this project mission into SPECIFIC sub-goals. Today is {today_str}.\n\n"
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

        from django.utils import timezone
        today_str = timezone.now().strftime("%A, %B %d, %Y")

        system = (
            persona_block
            + f"You are the TeamOS Plan Architect. Today is {today_str}.\n\n"
            "CRITICAL RULES:\n"
            "- Task titles MUST be domain-specific and technical.\n"
            "- REJECTED: 'Implement features', 'Define requirements', 'Test the system'\n"
            "- REQUIRED: 'Build KYC/AML verification pipeline', 'Implement settlement engine'\n"
            "- Reference wiki pages with [[Page Title]] syntax in descriptions.\n"
            "- Add a 'reasoning' field to each task explaining why it exists.\n"
            "- Assign tasks using assignee_id from Team Expertise.\n"
            f"- Every task needs startDate and endDate (YYYY-MM-DD). All schedules MUST be anchored to start on or after today ({today_str}).\n"
            + "CRITICAL DATE RULE: All dates MUST use the current year. Any date before 2026-05-01 is INVALID and will be rejected. "
            + "Use ONLY dates in 2026 or later. Never generate dates in 2023, 2024, or early 2025.\n\n"
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

    def _evaluate_and_select(
        self,
        fast_decomp: DecompositionResult,
        fast_draft: PlanDraft,
        risk_decomp: DecompositionResult,
        risk_draft: PlanDraft,
    ) -> tuple[str, PlanDraft, DecompositionResult, CritiqueResult]:
        """
        Evaluate alternative plan strategies (fast_track vs risk_mitigated)
        against team expertise, scope, and project constraints.
        Returns selected strategy name, chosen draft, chosen decomposition, and critique results.
        """
        ctx = self.domain_ctx

        system = (
            "You are the senior TeamOS Portfolio Director.\n"
            "You are evaluating two distinct planning drafts generated for the same project mission.\n"
            "Compare both candidates carefully and select the one that represents the highest execution quality, logical completeness, and realism.\n\n"
            "Candidate A (Fast-Track Strategy):\n"
            f"- Title: {fast_draft.project_name}\n"
            f"- Scope summary: {fast_decomp.scope_summary}\n"
            f"- Tasks: {json.dumps(fast_draft.tasks[:10])}\n\n"
            "Candidate B (Risk-Mitigated Strategy):\n"
            f"- Title: {risk_draft.project_name}\n"
            f"- Scope summary: {risk_decomp.scope_summary}\n"
            f"- Tasks: {json.dumps(risk_draft.tasks[:10])}\n\n"
            "Evaluate them across these criteria:\n"
            "1. Realism: Do timeline mappings fit the scope?\n"
            "2. Concurrency: Are sequential blockers avoided where possible?\n"
            "3. Integrity: Are critical engineering deliverables addressed?\n"
            "Select the single best strategy and justify your choice.\n\n"
            "Return JSON:\n"
            "  selected_strategy: 'fast_track' | 'risk_mitigated'\n"
            "  justification: string\n"
            "  score: 0-100\n"
            "  issues: [{type, description, severity: 'low'|'medium'|'high'}]\n"
            "  suggestions: [string]\n"
        )

        result = llm_json_call(
            team=self.team,
            operation="plan_select_strategy",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": "Choose the optimal plan candidate."},
            ],
            default_on_error={
                "selected_strategy": "fast_track",
                "justification": "Fallback choice",
                "score": 80,
                "issues": [],
                "suggestions": [],
            },
        )

        choice = result.get("selected_strategy", "fast_track")
        justification = result.get("justification", "")
        score = result.get("score", 80)
        issues = result.get("issues", [])
        suggestions = result.get("suggestions", [])

        # Include justification in suggestions list
        if justification:
            suggestions.insert(0, f"Strategy Decision ({choice}): {justification}")

        critique = CritiqueResult(
            score=score,
            issues=issues,
            revised_tasks=[],
            revised_milestones=[],
            suggestions=suggestions,
        )

        if choice == "risk_mitigated":
            return "risk_mitigated", risk_draft, risk_decomp, critique
        else:
            return "fast_track", fast_draft, fast_decomp, critique

