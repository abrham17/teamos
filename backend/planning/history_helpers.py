"""
history_helpers.py — Intelligent context-aware clarification engine.

Provides two key functions:
  - extract_answered_topics(chat_history): fast keyword scan — no LLM call
  - decide_clarifying_question(...):       rich-signal LLM decision
  - consolidate_planning_prompt(...):      unchanged from previous version
"""
import logging
import json
import re
from typing import Any, Dict, List, Optional

from llm_orchestrator.orchestrator import llm_call, llm_json_call

logger = logging.getLogger(__name__)


# ── Topic Keyword Maps ─────────────────────────────────────────────────────────

# Maps each topic slug to patterns that indicate it was already addressed
_TOPIC_PATTERNS: Dict[str, List[str]] = {
    "detail_level": [
        r"\bdaily\s+subtask",
        r"\bhigh.level\b",
        r"\bkeep\s+it\s+(high.level|simple|focused)\b",
        r"\binclude\s+(daily|subtask|subtasks|breakdown)\b",
        r"\bdetail(ed)?\s+(breakdown|level|task)\b",
        r"\bmilestone.only\b",
    ],
    "priority_workstream": [
        r"\bpriority\b.*\b(dev|design|launch|marketing|qa|testing|backend|frontend)\b",
        r"\b(dev|design|launch|marketing|qa|backend|frontend)\b.*\bpriority\b",
        r"\ball\s+equal\s+priority\b",
        r"\bfocus\s+(first|on)\b.*(dev|design|launch)\b",
        r"\bhighest\s+priority\b",
        r"\bprioritize\b",
    ],
    "conflict_handling": [
        r"\bauto.resolv",
        r"\bresolv\s+conflict",
        r"\bmanually\s+review",
        r"\bskip\s+(conflict|check)\b",
        r"\bconflict(s)?\s+(resolv|detect|check)\b",
    ],
    "team_size": [
        r"\b(\d+)\s+(engineer|developer|person|people|member|designer)\b",
        r"\bsmall\s+team\b",
        r"\bjust\s+(me|myself|one)\b",
        r"\bteam\s+of\s+\d+\b",
        r"\bsolo\b",
    ],
    "deadline": [
        r"\bdeadline\b",
        r"\bdue\s+(date|by)\b",
        r"\blaunch\s+(in|by|on)\b",
        r"\bdeliver\s+by\b",
        r"\bfinish\s+by\b",
        r"\bgo.live\b",
        r"\b(q[1-4]|quarter)\b",
        r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b",
    ],
    "tech_stack": [
        r"\b(react|vue|angular|next\.?js|django|rails|laravel|spring|flask|fastapi)\b",
        r"\b(postgres|mysql|mongodb|redis|elasticsearch)\b",
        r"\b(aws|gcp|azure|heroku|vercel|railway)\b",
        r"\btech\s+(stack|choice)\b",
        r"\busing\s+(python|javascript|typescript|go|rust|java)\b",
    ],
    "scope": [
        r"\bmvp\b",
        r"\bphase\s+[0-9]\b",
        r"\bin\s+scope\b",
        r"\bout\s+of\s+scope\b",
        r"\bjust\s+(the|focus)\b.*\bfor\s+now\b",
        r"\bstick\s+to\b",
        r"\bonly\b.*(feature|module|part)\b",
    ],
}


def extract_answered_topics(chat_history: Optional[List[Dict[str, Any]]]) -> List[str]:
    """
    Fast keyword scan of conversation history to detect which planning topics
    the user has already addressed. Returns a list of topic slugs.

    No LLM call — purely regex-based for speed.
    """
    if not chat_history:
        return []

    # Combine all user messages into one searchable blob
    user_text = " ".join(
        (msg.get("content") or msg.get("text") or "")
        for msg in chat_history
        if msg.get("role") in ("user", "human")
    ).lower()

    answered = []
    for topic, patterns in _TOPIC_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, user_text, re.IGNORECASE):
                answered.append(topic)
                break  # topic matched, move to next

    return answered


def decide_clarifying_question(
    *,
    prompt: str,
    chat_history: Optional[List[Dict[str, Any]]],
    team,
    mode: str,
    wiki_snippets_found: int = 0,
    knowledge_gaps: Optional[List[str]] = None,
    wiki_is_sparse: bool = False,
    risk_factors: Optional[List[str]] = None,
    project_summary: str = "",
    already_answered_topics: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Intelligently decide whether to ask the user a clarifying question before
    proceeding with plan generation or update.

    Returns:
        None  — proceed immediately, no question needed
        dict  — {"question": str, "options": list[str]}  — ask this one question

    Decision signals used:
        - Chat history (for context and answered detection)
        - Current prompt
        - Wiki research quality (snippets found, gaps, sparseness)
        - Project risk factors (for manage mode)
        - Already-answered topic list (from extract_answered_topics)
    """
    knowledge_gaps = knowledge_gaps or []
    risk_factors = risk_factors or []
    already_answered = already_answered_topics or []

    # ── Fast-path: skip question if prompt explicitly says so ────────────────
    low_prompt = prompt.lower()
    if any(kw in low_prompt for kw in [
        "skip", "bypass", "no questions", "just do it", "proceed", "go ahead",
        "don't ask", "without asking", "straight away", "directly"
    ]):
        logger.debug("decide_clarifying_question: fast-path skip (explicit bypass in prompt)")
        return None

    # ── Fast-path: rich context + history → almost certainly enough ──────────
    has_rich_history = bool(chat_history and len(chat_history) >= 2)
    has_rich_wiki = wiki_snippets_found >= 4 and not wiki_is_sparse
    no_gaps = len(knowledge_gaps) == 0

    if has_rich_history and has_rich_wiki and no_gaps and len(already_answered) >= 2:
        logger.debug(
            "decide_clarifying_question: fast-path skip "
            "(rich history + wiki + no gaps + %d answered topics)", len(already_answered)
        )
        return None

    # ── Build LLM decision prompt ────────────────────────────────────────────
    history_summary = ""
    if chat_history:
        lines = []
        for msg in chat_history[-12:]:
            role = msg.get("role") or msg.get("sender") or ""
            content = (msg.get("content") or msg.get("text") or "")[:300]
            if role and content:
                label = "User" if role in ("user", "human") else "AI"
                lines.append(f"{label}: {content}")
        history_summary = "\n".join(lines)

    gaps_text = "\n".join(f"  - {g}" for g in knowledge_gaps[:6]) if knowledge_gaps else "  (none detected)"
    risk_text = "\n".join(f"  - {r}" for r in risk_factors[:5]) if risk_factors else "  (none)"
    answered_text = ", ".join(already_answered) if already_answered else "none"

    system_prompt = (
        "You are the TeamOS Planning Intelligence Engine.\n"
        "Your role: decide if ONE critical clarifying question should be asked before planning, "
        "or if we have enough information to proceed directly.\n\n"
        "## Rules (strictly follow):\n"
        "1. Ask AT MOST one question. Never more.\n"
        "2. NEVER ask about a topic already answered (see 'Already Answered Topics' below).\n"
        "3. Only ask if the answer would MEANINGFULLY change the plan's structure, "
        "scope, or timeline. Generic questions are NOT acceptable.\n"
        "4. If wiki research found relevant context OR the user prompt is detailed → prefer proceeding.\n"
        "5. The question MUST be specific to what was actually found/missing in this session.\n"
        "6. Phrase questions conversationally, referencing what you actually know about their project.\n\n"
        "## Signals Available:\n"
        f"Mode: {mode}\n"
        f"Wiki Snippets Found: {wiki_snippets_found}\n"
        f"Wiki is Sparse: {wiki_is_sparse}\n"
        f"Knowledge Gaps Detected:\n{gaps_text}\n"
        f"Project Risk Factors:\n{risk_text}\n"
        f"Project Context: {project_summary or '(none)'}\n"
        f"Already Answered Topics: {answered_text}\n\n"
        "## Response Format (strict JSON, no markdown):\n"
        "If proceeding without question: {\"ask\": false}\n"
        "If asking: {\"ask\": true, \"question\": \"<question text>\", \"options\": [\"<A>\", \"<B>\", \"<C>\"], "
        "\"reason\": \"<one-line why this is critical>\"}\n"
        "Options must be 2–4 short choices that cover the realistic range of answers. "
        "Always add a final option like 'Proceed with your best judgment' as a safe default.\n"
        "Return ONLY valid JSON."
    )

    user_content = (
        f"Latest Prompt: {prompt[:500]}\n\n"
        f"=== CONVERSATION HISTORY ===\n{history_summary or '(no prior conversation)'}"
    )

    try:
        result = llm_json_call(
            team=team,
            operation="decide_clarifying_question",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            default_on_error={"ask": False},
        )

        if not result.get("ask"):
            logger.debug("decide_clarifying_question: LLM decided no question needed")
            return None

        question_text = result.get("question", "")
        options = result.get("options", [])
        reason = result.get("reason", "")

        if not question_text:
            logger.debug("decide_clarifying_question: LLM ask=true but empty question, skipping")
            return None

        if not isinstance(options, list):
            options = []

        logger.info(
            "decide_clarifying_question: asking question — %s (reason: %s)",
            question_text[:80], reason[:80]
        )
        return {"question": question_text, "options": options}

    except Exception:
        logger.exception("decide_clarifying_question: LLM call failed, defaulting to proceed")
        return None


def consolidate_planning_prompt(
    prompt: str,
    chat_history: Optional[List[Dict[str, Any]]],
    team,
) -> str:
    """
    Synthesize a single comprehensive planning prompt by combining conversation
    history and the user's latest input. Prevents the planner from losing context
    across turns. Unchanged from previous version.
    """
    if not chat_history:
        return prompt

    history_str = ""
    for msg in chat_history:
        role = msg.get("role") or msg.get("sender")
        content = msg.get("content") or msg.get("text") or ""
        if role and content:
            role_label = "User" if role in ("user", "human") else "AI Architect"
            history_str += f"{role_label}: {content}\n"

    history_str += f"User (latest reply): {prompt}\n"

    consolidation_prompt = (
        "You are the TeamOS Planning Prompt Synthesizer.\n"
        "Your task is to merge the conversation history and the latest user response into a single, "
        "comprehensive, self-contained planning prompt.\n"
        "This consolidated prompt will be passed to a downstream automated planning agent.\n"
        "It must preserve: the core project mission, any specified constraints, and all user choices "
        "made in response to questions (e.g., detail level, priority workstreams, conflict resolution).\n\n"
        f"=== CONVERSATION HISTORY ===\n{history_str}\n"
        "Return ONLY the consolidated planning prompt text. "
        "Do not add any greeting, intro, or markdown formatting."
    )

    try:
        res, _, _ = llm_call(
            team=team,
            operation="consolidate_prompt",
            messages=[{"role": "system", "content": consolidation_prompt}],
        )
        if res and hasattr(res, "choices") and res.choices:
            consolidated = res.choices[0].message.content.strip()
            if consolidated:
                logger.info("Consolidated prompt: %s...", consolidated[:100])
                return consolidated
    except Exception:
        logger.exception("consolidate_planning_prompt: failed, falling back to simple concat")

    return f"{prompt}\n\n[History context]\n{history_str.strip()}"
