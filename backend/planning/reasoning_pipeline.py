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
import time
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

    def __init__(self, team: Team, user: User, sse_queue: Optional[Any] = None):
        self.team = team
        self.user = user
        self.team_id = str(team.id)
        self.domain_ctx = None   # Set during Stage 2
        self.sse_queue = sse_queue

    def run(
        self,
        prompt: str,
        mode: str = "create",
        project_context: dict | None = None,
        chat_history: list[dict] | None = None,
    ) -> Iterator[str]:
        import queue
        import threading

        q = self.sse_queue or queue.Queue()
        self.sse_queue = q

        def worker():
            try:
                self._run_internal(prompt, mode, project_context, chat_history, q)
            except Exception as e:
                logger.exception("Reasoning pipeline worker failed")
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
        self,
        prompt: str,
        mode: str,
        project_context: dict | None,
        chat_history: list[dict] | None,
        q: Any,
    ) -> None:
        reasoning_stages = []

        # ── Stage 1: Research (wiki-first) ────────────────────────
        stage_start = time.time()
        q.put(_sse("agent_status", {"status": "Searching wiki knowledge base..."}))
        q.put(_sse("agent_activity", {
            "id": "research-start",
            "kind": "status",
            "message": "I'm searching the team wiki for relevant knowledge about this project...",
            "status": "running",
        }))
        q.put(_sse("agent_step", {"name": "reasoning_research", "arguments": json.dumps({"query": prompt[:80]})}))

        research = self._research(prompt)
        research_duration_ms = int((time.time() - stage_start) * 1000)

        q.put(_sse("agent_activity", {
            "id": "research-done",
            "kind": "status",
            "message": f"I found {len(research.snippets)} wiki pages and identified {len(research.knowledge_gaps)} knowledge gaps.",
            "status": "done",
            "detail": {
                "snippets_found": len(research.snippets),
                "knowledge_gaps": len(research.knowledge_gaps),
                "wiki_sparse": research.wiki_is_sparse,
                "duration_ms": research_duration_ms,
            }
        }))
        reasoning_stages.append({
            "name": "research",
            "label": "Research",
            "status": "done",
            "duration_ms": research_duration_ms,
            "summary": f"Found {len(research.snippets)} wiki snippets",
            "metrics": {"snippets": len(research.snippets), "knowledge_gaps": len(research.knowledge_gaps)},
        })

        q.put(_sse("agent_result", {
            "name": "reasoning_research",
            "ok": True,
            "result": {
                "snippets_found": len(research.snippets),
                "wiki_sparse": research.wiki_is_sparse,
                "knowledge_gaps": research.knowledge_gaps[:3],
            },
        }))

        # ── Interactive Questions Flow (Phase 2.5) ───────────────────
        from .history_helpers import (
            decide_clarifying_question,
            extract_answered_topics,
            consolidate_planning_prompt,
        )

        already_answered = extract_answered_topics(chat_history)
        question = decide_clarifying_question(
            prompt=prompt,
            chat_history=chat_history or [],
            team=self.team,
            mode=mode,
            wiki_snippets_found=len(research.snippets),
            knowledge_gaps=research.knowledge_gaps,
            wiki_is_sparse=research.wiki_is_sparse,
            already_answered_topics=already_answered,
        )
        if question:
            q.put(_sse("ask_user", question))
            return

        # Consolidate prompt with history context before downstream stages
        prompt = consolidate_planning_prompt(prompt, chat_history, self.team)

        # ── Stage 2: Synthesize Domain from wiki + prompt ─────────
        stage_start = time.time()
        q.put(_sse("agent_status", {"status": "Synthesizing domain context from wiki knowledge..."}))
        q.put(_sse("agent_activity", {
            "id": "synthesize-start",
            "kind": "status",
            "message": "I'm analyzing the wiki content to understand the domain context and technical vocabulary...",
            "status": "running",
        }))
        q.put(_sse("agent_step", {"name": "reasoning_synthesize", "arguments": "{}"}))

        from planning.domain_classifier import synthesize_domain
        self.domain_ctx = synthesize_domain(prompt, research.context_text, self.team)
        synthesize_duration_ms = int((time.time() - stage_start) * 1000)

        q.put(_sse("agent_activity", {
            "id": "synthesize-done",
            "kind": "status",
            "message": f"I've identified this as a {self.domain_ctx.domain}/{self.domain_ctx.sub_domain} project. Key vocabulary includes {', '.join(self.domain_ctx.task_vocabulary[:4])}.",
            "status": "done",
            "detail": {
                "domain": self.domain_ctx.domain,
                "sub_domain": self.domain_ctx.sub_domain,
                "vocabulary_count": len(self.domain_ctx.task_vocabulary),
                "duration_ms": synthesize_duration_ms,
            }
        }))
        reasoning_stages.append({
            "name": "synthesize",
            "label": "Synthesize",
            "status": "done",
            "duration_ms": synthesize_duration_ms,
            "summary": f"Domain: {self.domain_ctx.domain} / {self.domain_ctx.sub_domain}",
            "metrics": {"domain": self.domain_ctx.domain, "vocabulary_count": len(self.domain_ctx.task_vocabulary)},
        })

        q.put(_sse("agent_result", {
            "name": "reasoning_synthesize",
            "ok": True,
            "result": {
                "domain": self.domain_ctx.domain,
                "sub_domain": self.domain_ctx.sub_domain,
                "expert": self.domain_ctx.expert_persona[:100],
                "vocabulary_count": len(self.domain_ctx.task_vocabulary),
                "seed_tasks_available": len(self.domain_ctx.seed_tasks),
            },
        }))

        # ── Stage 3 & 4: Combined Decompose & Draft ──────────────────
        stage_start = time.time()
        q.put(_sse("agent_status", {"status": f"Speculatively decomposing and drafting alternative plans ({self.domain_ctx.sub_domain})..."}))
        q.put(_sse("agent_activity", {
            "id": "decompose-start",
            "kind": "status",
            "message": "I'm breaking down the mission into concrete sub-goals and generating two parallel plan strategies...",
            "status": "running",
        }))
        q.put(_sse("agent_step", {"name": "reasoning_decompose", "arguments": json.dumps({"strategies": ["fast_track", "risk_mitigated"]})}))

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_fast = executor.submit(self._decompose_and_draft, prompt, mode, project_context, research, "fast_track")
            future_risk = executor.submit(self._decompose_and_draft, prompt, mode, project_context, research, "risk_mitigated")
            
            try:
                fast_decomp, fast_draft = future_fast.result()
            except Exception as e:
                logger.exception("Fast-track strategy generation failed")
                fast_decomp, fast_draft = self._decompose_and_draft(prompt, mode, project_context, research, "balanced", sse_queue=q)
                
            try:
                risk_decomp, risk_draft = future_risk.result()
            except Exception as e:
                logger.exception("Risk-mitigated strategy generation failed")
                risk_decomp, risk_draft = fast_decomp, fast_draft

        decompose_duration_ms = int((time.time() - stage_start) * 1000)

        q.put(_sse("agent_activity", {
            "id": "decompose-done",
            "kind": "status",
            "message": f"I've generated {len(fast_decomp.goals)} sub-goals and drafted 2 plan candidates. Fast-track has {len(fast_draft.tasks)} tasks, risk-mitigated has {len(risk_draft.tasks)} tasks.",
            "status": "done",
            "detail": {
                "fast_track_tasks": len(fast_draft.tasks),
                "risk_mitigated_tasks": len(risk_draft.tasks),
                "goals": len(fast_decomp.goals),
                "duration_ms": decompose_duration_ms,
            }
        }))
        reasoning_stages.append({
            "name": "decompose",
            "label": "Decompose",
            "status": "done",
            "duration_ms": decompose_duration_ms,
            "summary": f"Generated {len(fast_decomp.goals)} goals",
            "metrics": {"fast_track_goals": len(fast_decomp.goals), "risk_mitigated_goals": len(risk_decomp.goals)},
        })
        reasoning_stages.append({
            "name": "draft",
            "label": "Draft",
            "status": "done",
            "duration_ms": 0,
            "summary": f"2 candidates generated",
            "metrics": {"fast_track_tasks": len(fast_draft.tasks), "risk_mitigated_tasks": len(risk_draft.tasks)},
        })

        q.put(_sse("agent_result", {
            "name": "reasoning_decompose",
            "ok": True,
            "result": {
                "fast_track_goals": len(fast_decomp.goals),
                "risk_mitigated_goals": len(risk_decomp.goals),
                "constraints_analyzed": len(fast_decomp.constraints) + len(risk_decomp.constraints),
            },
        }))

        q.put(_sse("agent_step", {"name": "reasoning_draft", "arguments": json.dumps({"mode": mode})}))
        q.put(_sse("agent_result", {
            "name": "reasoning_draft",
            "ok": True,
            "result": {
                "candidates_generated": 2,
                "fast_track_tasks": len(fast_draft.tasks),
                "risk_mitigated_tasks": len(risk_draft.tasks),
            },
        }))

        # ── Stage 5: Critique & Path Evaluation Selection ──────────
        stage_start = time.time()
        q.put(_sse("agent_status", {"status": "Evaluating alternative paths and self-critiquing..."}))
        q.put(_sse("agent_activity", {
            "id": "critique-start",
            "kind": "status",
            "message": "I'm evaluating both plan strategies against the team's velocity and project constraints...",
            "status": "running",
        }))
        q.put(_sse("agent_step", {"name": "reasoning_critique", "arguments": json.dumps({"candidates": ["fast_track", "risk_mitigated"]})}))

        strategy_choice, draft, decomposition, critique = self._evaluate_and_select(
            fast_decomp, fast_draft, risk_decomp, risk_draft
        )
        critique_duration_ms = int((time.time() - stage_start) * 1000)

        q.put(_sse("agent_activity", {
            "id": "critique-done",
            "kind": "status",
            "message": f"I've selected the {strategy_choice} strategy with a critique score of {critique.score}/100. This choice balances delivery speed with engineering quality.",
            "status": "done",
            "detail": {
                "selected_strategy": strategy_choice,
                "score": critique.score,
                "issues_found": len(critique.issues),
                "duration_ms": critique_duration_ms,
            }
        }))
        reasoning_stages.append({
            "name": "critique",
            "label": "Critique",
            "status": "done",
            "duration_ms": critique_duration_ms,
            "summary": f"Selected {strategy_choice} (score: {critique.score}/100)",
            "metrics": {"selected_strategy": strategy_choice, "score": critique.score},
        })

        q.put(_sse("agent_result", {
            "name": "reasoning_critique",
            "ok": True,
            "result": {
                "selected_strategy": strategy_choice,
                "score": critique.score,
                "issues_found": len(critique.issues),
                "suggestions": critique.suggestions[:3],
            },
        }))

        # ── Stage 6: Finalize ─────────────────────────────────────
        stage_start = time.time()
        q.put(_sse("agent_status", {"status": "Inferring dependencies and scheduling..."}))
        q.put(_sse("agent_activity", {
            "id": "finalize-start",
            "kind": "status",
            "message": "I'm now inferring task dependencies and adjusting dates based on the team's historical velocity...",
            "status": "running",
        }))
        q.put(_sse("agent_step", {"name": "reasoning_finalize", "arguments": "{}"}))

        draft = self._finalize(draft)
        finalize_duration_ms = int((time.time() - stage_start) * 1000)

        deps_inferred = sum(1 for t in draft.tasks if t.get("dependency_ids"))
        tasks_scheduled = sum(1 for t in draft.tasks if t.get("start_date"))

        q.put(_sse("agent_activity", {
            "id": "finalize-done",
            "kind": "status",
            "message": f"I've inferred {deps_inferred} task dependencies and scheduled {tasks_scheduled} tasks based on team velocity. The plan is ready for review.",
            "status": "done",
            "detail": {
                "dependencies_inferred": deps_inferred,
                "tasks_scheduled": tasks_scheduled,
                "duration_ms": finalize_duration_ms,
            }
        }))
        reasoning_stages.append({
            "name": "finalize",
            "label": "Finalize",
            "status": "done",
            "duration_ms": finalize_duration_ms,
            "summary": f"{deps_inferred} dependencies inferred",
            "metrics": {"dependencies_inferred": deps_inferred},
        })

        q.put(_sse("agent_result", {
            "name": "reasoning_finalize",
            "ok": True,
            "result": {
                "dependencies_inferred": sum(1 for t in draft.tasks if t.get("dependency_ids")),
                "tasks_scheduled": sum(1 for t in draft.tasks if t.get("start_date")),
            },
        }))

        q.put(_sse("agent_status", {"status": "Plan reasoning complete."}))

        # Build wiki snippets with URLs for frontend
        wiki_snippets_for_frontend = [
            {
                "source": s.source,
                "content": s.content[:200] + "..." if len(s.content) > 200 else s.content,
                "score": s.score,
                "page_id": s.page_id,
                "page_url": f"/wiki?page={s.page_id}" if s.page_id else None,
                "match": s.match,
            }
            for s in research.snippets[:10]
        ]

        # Build domain context for frontend
        domain_context_for_frontend = None
        if self.domain_ctx:
            domain_context_for_frontend = {
                "domain": self.domain_ctx.domain,
                "sub_domain": self.domain_ctx.sub_domain,
                "expert_persona": self.domain_ctx.expert_persona,
                "vocabulary": self.domain_ctx.task_vocabulary[:20],
                "constraints": self.domain_ctx.domain_constraints,
                "dependency_patterns": getattr(self.domain_ctx, "dependency_patterns", None) or [],
            }

        # Build strategy comparison for frontend
        strategy_comparison_for_frontend = {
            "fast_track": {
                "tasks": len(fast_draft.tasks),
                "duration_days": 0,
                "description": "Maximum concurrency, rapid sprint lifecycle",
            },
            "risk_mitigated": {
                "tasks": len(risk_draft.tasks),
                "duration_days": 0,
                "description": "Mandatory QA, buffer time, stability focus",
            },
            "selected": strategy_choice,
            "justification": critique.suggestions[0] if critique.suggestions else f"Selected {strategy_choice} based on realism and engineering integrity",
        }

        q.put(_sse("reasoning_done", {
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
            "reasoning_stages": reasoning_stages,
            "wiki_snippets": wiki_snippets_for_frontend,
            "domain_context": domain_context_for_frontend,
            "strategy_comparison": strategy_comparison_for_frontend,
        }))

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

        # Context Budgeting (Phase 3): Limit retrieved snippet size to 15k tokens (~60k chars)
        MAX_SNIPPETS_CHARS = 60000
        budgeted_snippets = []
        current_chars = 0
        for s in snippets:
            snippet_len = len(s.source) + len(s.content) + 10
            if current_chars + snippet_len > MAX_SNIPPETS_CHARS:
                # Truncate content of last acceptable snippet if space allows
                space_left = MAX_SNIPPETS_CHARS - current_chars - len(s.source) - 15
                if space_left > 100:
                    truncated_content = s.content[:space_left] + "..."
                    budgeted_snippets.append(WikiSnippet(
                        source=s.source,
                        content=truncated_content,
                        score=s.score,
                        page_id=s.page_id,
                        match=s.match,
                    ))
                break
            budgeted_snippets.append(s)
            current_chars += snippet_len

        # Build pre-formatted context string for LLM
        context_parts = [
            f"[{s.source}]: {s.content}"
            for s in budgeted_snippets
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
        sse_queue: Any = None,
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

        expertise_text = "\n".join(expertise_lines) if expertise_lines else "No specific expertise mapping."

        system = (
            f"ROLE: expert project planner specializing in the {ctx.domain if ctx else 'general'} domain.\n"
            f"EXPERT_PERSONA: {ctx.expert_persona if ctx else 'Experienced manager.'}\n"
            f"STRATEGY: {strategy}\n"
            "TASK: Decompose target goals and draft a high-fidelity plan matching today's reality.\n"
            "VOCABULARY:\n"
            + (", ".join(ctx.task_vocabulary[:30]) if ctx else "standard planner")
            + "\n"
            "OUTPUT_SCHEMA:\n"
            "{\n"
            "  \"goals\": [{\"title\": str, \"description\": str, \"constraints\": [str], \"assumptions\": [str]}],\n"
            "  \"constraints\": [str],\n"
            "  \"assumptions\": [str],\n"
            "  \"scope_summary\": str,\n"
            "  \"projectName\": str,\n"
            "  \"description\": str,\n"
            "  \"tasks\": [{\"id\": str, \"title\": str, \"description\": str, \"status\": str, \"priority\": str, \"startDate\": str, \"endDate\": str, \"assignee_id\": str, \"reasoning\": str, \"wikiReferences\": [str]}],\n"
            "  \"milestones\": [{\"id\": str, \"title\": str, \"date\": str, \"description\": str, \"status\": str}],\n"
            "  \"members\": [{\"userId\": str, \"role\": str}],\n"
            "  \"reasoning_traces\": [str],\n"
            "  \"wiki_references\": [str]\n"
            "}"
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
            sse_queue=sse_queue,
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
            f"ROLE: AI domain planner. Today: {today_str}.\n"
            f"DOMAIN: {ctx.domain if ctx else 'general'} / {ctx.sub_domain if ctx else 'general'}\n"
            "RULES:\n"
            "- decompose mission into concrete sub-goals\n"
            "- technical deliverables only, no generic phases\n"
            "OUTPUT_SCHEMA:\n"
            "{\n"
            "  \"goals\": [{\"title\": str, \"description\": str, \"constraints\": [str], \"assumptions\": [str]}],\n"
            "  \"constraints\": [str],\n"
            "  \"assumptions\": [str],\n"
            "  \"scope_summary\": str\n"
            "}"
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

        vocab = ", ".join(ctx.task_vocabulary[:8]) if (ctx and not ctx.is_general) else ""

        system = (
            f"ROLE: AI task scheduler. Today: {today_str}.\n"
            f"DOMAIN: {ctx.domain if ctx else 'general'} / {ctx.sub_domain if ctx else 'general'}\n"
            f"VOCABULARY: {vocab}\n"
            f"RULES:\n"
            "- technical task titles only\n"
            "- reference wiki pages using [[Page Title]]\n"
            "- assign task to assignee_id\n"
            f"- dates >= today ({today_str}) and must use year 2026\n"
            "OUTPUT_SCHEMA:\n"
            "{\n"
            "  \"projectName\": str,\n"
            "  \"description\": str,\n"
            "  \"tasks\": [{\"id\": str, \"title\": str, \"description\": str, \"status\": str, \"priority\": str, \"startDate\": str, \"endDate\": str, \"assignee_id\": str, \"reasoning\": str, \"wikiReferences\": [str]}],\n"
            "  \"milestones\": [{\"id\": str, \"title\": str, \"date\": str, \"description\": str, \"status\": str}],\n"
            "  \"members\": [{\"userId\": str, \"role\": str}],\n"
            "  \"reasoning_traces\": [str],\n"
            "  \"wiki_references\": [str]\n"
            "}"
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
            "ROLE: Senior project reviewer.\n"
            f"CRITERIA: coverage, realism, dependency order, risks, completeness. {domain_criteria.strip()}\n"
            "OUTPUT_SCHEMA:\n"
            "{\n"
            "  \"score\": int (0-100),\n"
            "  \"issues\": [{\"type\": str, \"description\": str, \"severity\": \"low\"|\"medium\"|\"high\"}],\n"
            "  \"revised_tasks\": [dict] (only if changes needed; preserve id, dates),\n"
            "  \"revised_milestones\": [dict] (only if changes needed),\n"
            "  \"suggestions\": [str]\n"
            "}"
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
            sse_queue=self.sse_queue,
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
            "ROLE: Portfolio Director.\n"
            "TASK: Evaluate two plan candidates and select the optimal one.\n"
            "CANDIDATES:\n"
            f"- Candidate A (Fast-Track): {fast_draft.project_name}. Scope: {fast_decomp.scope_summary}. Tasks: {json.dumps(fast_draft.tasks[:10])}\n"
            f"- Candidate B (Risk-Mitigated): {risk_draft.project_name}. Scope: {risk_decomp.scope_summary}. Tasks: {json.dumps(risk_draft.tasks[:10])}\n"
            "CRITERIA: realism, concurrency, engineering integrity.\n"
            "OUTPUT_SCHEMA:\n"
            "{\n"
            "  \"selected_strategy\": \"fast_track\" | \"risk_mitigated\",\n"
            "  \"justification\": str,\n"
            "  \"score\": int (0-100),\n"
            "  \"issues\": [{\"type\": str, \"description\": str, \"severity\": \"low\"|\"medium\"|\"high\"}],\n"
            "  \"suggestions\": [str]\n"
            "}"
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
            sse_queue=self.sse_queue,
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

