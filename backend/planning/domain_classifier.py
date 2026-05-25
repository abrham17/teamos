"""
Domain Synthesizer for Planning.

Instead of a hardcoded domain registry, this module:
  1. Receives the wiki context already retrieved for the prompt
  2. Calls the LLM to synthesize a domain understanding from that context + the user's prompt
  3. Returns a DomainContext with expert persona, vocabulary, constraints,
     dependency patterns, and seed tasks — all generated dynamically.

This means the planner adapts to whatever domain the team's wiki describes,
not to a pre-written list of known domains.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class DomainContext:
    """Dynamically synthesised domain understanding derived from wiki + LLM."""
    domain: str                          # e.g. "fintech", "ml_platform", "healthcare"
    sub_domain: str                      # e.g. "merchant_payments", "rag_pipeline"
    expert_persona: str                  # full persona injected into LLM prompts
    task_vocabulary: list[str] = field(default_factory=list)
    domain_constraints: list[str] = field(default_factory=list)
    seed_tasks: list[dict[str, Any]] = field(default_factory=list)
    dependency_patterns: list[tuple[list[str], list[str]]] = field(default_factory=list)

    @property
    def is_general(self) -> bool:
        return self.domain == "general"


def synthesize_domain(
    prompt: str,
    wiki_context: str,
    team,
) -> DomainContext:
    """
    Ask the LLM to synthesize a domain context from the wiki knowledge + prompt.

    The LLM reads what the wiki actually contains and infers:
    - What domain/sub-domain this project belongs to
    - What expert persona to adopt
    - What technical vocabulary to use
    - What domain-specific constraints apply
    - What seed tasks are appropriate (used only if wiki is sparse)
    - What dependency ordering patterns apply

    No hardcoded domain list. The LLM derives everything from the wiki context.
    
    Caches the results to avoid duplicate domain synthesis LLM calls (Phase 5.2).
    """
    import hashlib
    from django.core.cache import cache

    # Build cache key based on team, prompt, and wiki context
    hasher = hashlib.sha256()
    hasher.update(prompt.encode("utf-8"))
    hasher.update((wiki_context or "").encode("utf-8"))
    cache_key = f"domain_synth:{team.id}:{hasher.hexdigest()}"

    cached = cache.get(cache_key)
    if cached:
        logger.info("Found cached domain synthesis for team %s", team.id)
        # Reconstruct parsed patterns from list of lists
        parsed_patterns = []
        for p in cached.get("dependency_patterns", []):
            if len(p) == 2:
                parsed_patterns.append((p[0], p[1]))
        return DomainContext(
            domain=cached["domain"],
            sub_domain=cached["sub_domain"],
            expert_persona=cached["expert_persona"],
            task_vocabulary=cached.get("task_vocabulary", []),
            domain_constraints=cached.get("domain_constraints", []),
            seed_tasks=cached.get("seed_tasks", []),
            dependency_patterns=parsed_patterns,
        )

    from llm_orchestrator.orchestrator import llm_json_call

    has_wiki = bool((wiki_context or "").strip())

    wiki_block = (
        f"Team Wiki Knowledge (retrieved for this project):\n{wiki_context}"
        if has_wiki
        else "No wiki pages were found for this project. Infer the domain from the user prompt alone."
    )

    system = (
        "You are a Domain Intelligence Engine for a project planning system.\n\n"
        "Your job: read the team's wiki knowledge and the user's project request, "
        "then synthesize a rich domain context that will guide the planning agent.\n\n"
        "Return a JSON object with these fields:\n"
        "  domain: string — top-level domain label (e.g. 'fintech', 'ml_ai', 'devops', 'healthcare', 'ecommerce')\n"
        "  sub_domain: string — specific sub-domain (e.g. 'merchant_payments', 'llm_rag_pipeline', 'ci_cd_platform')\n"
        "  expert_persona: string — a 2-3 sentence expert identity for the planning LLM to adopt.\n"
        "    Example: 'You are a Senior Fintech Architect with 12 years building merchant payment platforms...'\n"
        "  task_vocabulary: list[string] — 8-12 domain-specific technical terms to use in task titles.\n"
        "    These must be precise and specific to THIS domain, not generic software terms.\n"
        "    BAD: ['implement features', 'test code'] GOOD: ['KYC pipeline', 'settlement engine', 'PCI-DSS tokenization']\n"
        "  domain_constraints: list[string] — 3-6 regulatory, compliance, or technical constraints for this domain.\n"
        "    Example: ['PCI-DSS Level 1 compliance', 'AML/KYC regulations', 'GDPR data handling']\n"
        "  seed_tasks: list[{title, description, priority}] — 8-12 domain-specific tasks.\n"
        "    These are only used when the wiki has no relevant content.\n"
        "    Each task title must be concrete and domain-specific.\n"
        "    BAD: 'Define requirements' | GOOD: 'Implement settlement calculation engine'\n"
        "  dependency_patterns: list[[downstream_keywords, upstream_keywords]] — domain task ordering rules.\n"
        "    Each entry is a 2-element array: [[downstream terms], [upstream terms]].\n"
        "    Example: [['settlement', 'payout'], ['payment gateway', 'transaction ledger']]\n\n"
        "IMPORTANT: Base your answer on what the wiki actually contains. "
        "If the wiki mentions specific technologies, APIs, or workflows, reflect those in your output. "
        "The goal is to make the plan feel like it was written by someone who has read the team's wiki."
    )

    user_content = (
        f"User Project Request: {prompt}\n\n"
        f"{wiki_block}"
    )

    result = llm_json_call(
        team=team,
        operation="domain_synthesize",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        default_on_error={
            "domain": "general",
            "sub_domain": "software",
            "expert_persona": (
                "You are a Senior Software Engineer and Project Architect. "
                "Generate specific, technical project plans. "
                "Avoid generic task names — use precise technical terms relevant to the system being built."
            ),
            "task_vocabulary": [],
            "domain_constraints": [],
            "seed_tasks": [],
            "dependency_patterns": [],
        },
    )

    # Parse dependency_patterns — LLM may return list of lists or list of dicts
    raw_patterns = result.get("dependency_patterns", [])
    parsed_patterns: list[tuple[list[str], list[str]]] = []
    for p in raw_patterns:
        try:
            if isinstance(p, (list, tuple)) and len(p) == 2:
                downstream = [str(x) for x in p[0]] if isinstance(p[0], list) else [str(p[0])]
                upstream = [str(x) for x in p[1]] if isinstance(p[1], list) else [str(p[1])]
                parsed_patterns.append((downstream, upstream))
        except Exception:
            pass

    domain = (result.get("domain") or "general").strip().lower().replace(" ", "_")
    sub_domain = (result.get("sub_domain") or "software").strip().lower().replace(" ", "_")

    logger.info("Domain synthesized from wiki+prompt: %s/%s", domain, sub_domain)

    # Cache result for 24 hours
    cache_data = {
        "domain": domain,
        "sub_domain": sub_domain,
        "expert_persona": result.get("expert_persona", ""),
        "task_vocabulary": result.get("task_vocabulary", []),
        "domain_constraints": result.get("domain_constraints", []),
        "seed_tasks": result.get("seed_tasks", []),
        "dependency_patterns": [[downstream, upstream] for downstream, upstream in parsed_patterns],
    }
    cache.set(cache_key, cache_data, timeout=86400)

    return DomainContext(
        domain=domain,
        sub_domain=sub_domain,
        expert_persona=result.get("expert_persona", ""),
        task_vocabulary=result.get("task_vocabulary", []),
        domain_constraints=result.get("domain_constraints", []),
        seed_tasks=result.get("seed_tasks", []),
        dependency_patterns=parsed_patterns,
    )
