# Topic 5: Improved Procedural Memory Loop
**TeamOS Deep Dive Series — Phase 2, Weeks 8–12**

> Your current memory system stores what happened. The upgrade makes it learn what works — per domain, per team, per intent type.

---

## What You Have Now (And Where It Falls Short)

Your current memory architecture has three components:

**Episodic Memory (`AgentEpisode`):** Stores interaction outcomes with 1536-dim pgvector embeddings. Recalled via cosine similarity for similar future situations. This is good — it's basically "case-based reasoning" for your agents.

**Working Memory (`AgentMemory`):** Key-value store with TTL for within-session state. Fine for what it is.

**Retrospective Learning (Celery task):** Analyzes failed/complex episodes, extracts root cause and guideline updates, stores as behavioral directives. Injects up to 20 directives into future system prompts via LRU cache (7-day TTL).

The retrospective loop is the right idea. But it has three problems:

**Problem 1: Directives are flat.** You store up to 20 general directives for the entire system. A directive extracted from a failed engineering sprint plan gets injected into a marketing content creation session where it's irrelevant noise.

**Problem 2: Directives are not typed.** "Be more careful with task dependencies" is mixed with "Always check if the GitHub repo exists before creating issues." One is a planning heuristic, the other is an integration constraint. They need different injection logic.

**Problem 3: No success learning.** Your retrospective task analyzes failed and complex episodes. It ignores highly successful runs. But successful runs contain the most valuable signal — what specific approach worked well for this team in this domain?

The upgrade fixes all three.

---

## The New Procedural Memory Model

### Memory Taxonomy

Procedural memories (directives) are now typed and domain-tagged:

```python
class DirectiveType(models.TextChoices):
    PLANNING_HEURISTIC   = "planning_heuristic"    # How to structure plans for this team
    INTEGRATION_RULE     = "integration_rule"       # Constraints for external tools
    COMMUNICATION_STYLE  = "communication_style"    # How this team prefers output formatted
    RISK_PATTERN         = "risk_pattern"           # Known risk factors in this domain
    WORKFLOW_PREFERENCE  = "workflow_preference"    # Task structure preferences
    VOCABULARY           = "vocabulary"             # Domain-specific terms this team uses
    FAILURE_PATTERN      = "failure_pattern"        # What NOT to do (from failed episodes)
    SUCCESS_PATTERN      = "success_pattern"        # What worked well (from successful episodes)
```

```python
# chat/models.py — modified AgentMemory

class ProceduralMemory(models.Model):
    """
    Replaces / extends the flat behavioral directives in AgentMemory.
    Domain-tagged, typed, with confidence scoring.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    team = models.ForeignKey("accounts.Team", on_delete=models.CASCADE)
    
    # Directive content
    directive = models.TextField()
    directive_type = models.CharField(max_length=50, choices=DirectiveType.choices)
    
    # Domain tagging (the core upgrade)
    domain = models.CharField(max_length=100, null=True, blank=True)
    # e.g., "product_launch", "engineering_sprint", "marketing_campaign",
    #        "bug_triage", "research", "onboarding", "quarterly_planning"
    
    # Intent type applicability
    applicable_intent_types = models.JSONField(default=list)
    # e.g., ["plan/create", "plan/update"] — only inject for these intent types
    
    # Provenance
    source_episode_ids = models.JSONField(default=list)  # Which episodes generated this
    extraction_method = models.CharField(max_length=50)  # "retrospective", "success_analysis"
    
    # Quality signals
    confidence = models.FloatField(default=0.7)   # 0.0 - 1.0
    reinforcement_count = models.IntegerField(default=1)  # How many episodes confirmed this
    contradiction_count = models.IntegerField(default=0)  # Episodes that contradicted this
    
    # Lifecycle
    last_used_at = models.DateTimeField(null=True)
    last_reinforced_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True)  # null = permanent
    
    class Meta:
        indexes = [
            models.Index(fields=["team", "domain", "directive_type"]),
            models.Index(fields=["team", "applicable_intent_types"]),
            models.Index(fields=["confidence", "reinforcement_count"]),
        ]
```

---

## The Enhanced Retrospective Task

### Triggered By (same as before, enhanced)

Your Celery task currently runs on failed/complex episodes. Add success analysis:

```python
# chat/tasks/retrospective.py

@shared_task
def run_retrospective(episode_id: str, team_id: str):
    episode = AgentEpisode.objects.get(id=episode_id)
    
    # Determine analysis type
    if episode.outcome == "success" and episode.quality_score >= 0.85:
        extract_success_patterns(episode, team_id)
    elif episode.outcome in ["failure", "partial"] or episode.rounds_taken > 6:
        extract_failure_patterns(episode, team_id)
    
    # Always: update existing directives if this episode reinforces or contradicts them
    update_existing_directives(episode, team_id)


def extract_success_patterns(episode: AgentEpisode, team_id: str):
    """New: Learn what worked well."""
    
    prompt = SUCCESS_ANALYSIS_PROMPT.format(
        user_message=episode.user_message,
        agent_actions=episode.tool_trace,
        final_output=episode.final_output,
        quality_score=episode.quality_score,
        domain=episode.inferred_domain
    )
    
    response = llm_call(
        messages=[{"role": "user", "content": prompt}],
        operation="success_analysis",
        priority="low",  # Background task — use cheapest model
        max_tokens=600
    )
    
    extracted = json.loads(response)
    
    for pattern in extracted["patterns"]:
        # Check if a similar directive already exists
        existing = ProceduralMemory.objects.filter(
            team_id=team_id,
            domain=extracted["domain"],
            directive_type=pattern["type"]
        ).filter(
            directive__icontains=pattern["keyword"]  # rough similarity check
        ).first()
        
        if existing:
            # Reinforce existing directive
            existing.reinforcement_count += 1
            existing.confidence = min(1.0, existing.confidence + 0.05)
            existing.last_reinforced_at = timezone.now()
            existing.source_episode_ids.append(str(episode.id))
            existing.save()
        else:
            # Create new directive
            ProceduralMemory.objects.create(
                team_id=team_id,
                directive=pattern["directive"],
                directive_type=pattern["type"],
                domain=extracted["domain"],
                applicable_intent_types=pattern["applicable_intents"],
                confidence=0.65,  # Start lower for new directives
                reinforcement_count=1,
                source_episode_ids=[str(episode.id)],
                extraction_method="success_analysis"
            )


def extract_failure_patterns(episode: AgentEpisode, team_id: str):
    """Existing logic — enhanced with domain tagging."""
    
    prompt = FAILURE_ANALYSIS_PROMPT.format(
        user_message=episode.user_message,
        agent_actions=episode.tool_trace,
        failure_point=episode.failure_point,
        error_trace=episode.error_trace,
        domain=episode.inferred_domain
    )
    
    response = llm_call(
        messages=[{"role": "user", "content": prompt}],
        operation="failure_analysis",
        priority="low",
        max_tokens=600
    )
    
    extracted = json.loads(response)
    
    for pattern in extracted["patterns"]:
        ProceduralMemory.objects.create(
            team_id=team_id,
            directive=pattern["directive"],
            directive_type=DirectiveType.FAILURE_PATTERN,
            domain=extracted["domain"],
            applicable_intent_types=pattern["applicable_intents"],
            confidence=0.8,  # Failure patterns start with higher confidence
            reinforcement_count=1,
            source_episode_ids=[str(episode.id)],
            extraction_method="retrospective"
        )
```

---

## The Domain Inferencer

Before you can tag directives by domain, you need to infer the domain from each episode. This runs as part of episode storage:

```python
# chat/memory/domain_inferencer.py

DOMAIN_INFERENCE_PROMPT = """
Classify this interaction into one of these domains (or invent a new one if none fit):
- product_launch
- engineering_sprint
- bug_triage
- marketing_campaign
- research_and_analysis
- quarterly_planning
- team_onboarding
- technical_documentation
- customer_success
- data_analysis
- hiring_and_recruiting

## User Message
{user_message}

## Key Actions Taken
{key_actions}

Output JSON: {{ "domain": "...", "confidence": 0.0-1.0, "sub_domain": "..." }}
"""

def infer_domain(episode: AgentEpisode) -> str:
    """Called when storing an AgentEpisode."""
    
    # Fast path: check if a known keyword is in the user message
    keyword_domains = {
        "sprint": "engineering_sprint",
        "launch": "product_launch", 
        "bug": "bug_triage",
        "campaign": "marketing_campaign",
        "okr": "quarterly_planning",
        "hire": "hiring_and_recruiting",
    }
    
    message_lower = episode.user_message.lower()
    for keyword, domain in keyword_domains.items():
        if keyword in message_lower:
            return domain
    
    # Slow path: LLM inference (use cheapest model)
    response = llm_call(
        messages=[{
            "role": "user",
            "content": DOMAIN_INFERENCE_PROMPT.format(
                user_message=episode.user_message,
                key_actions=[t["tool"] for t in episode.tool_trace[:10]]
            )
        }],
        operation="domain_inference",
        priority="low",
        max_tokens=100
    )
    
    result = json.loads(response)
    return result["domain"]
```

---

## The Precision Injection System

This is where the upgrade pays off. Instead of injecting up to 20 flat directives into every system prompt, inject only the relevant ones.

```python
# chat/memory/injection.py

def get_relevant_directives(
    team_id: str,
    intent_type: str,
    domain: str,
    max_directives: int = 8
) -> list[ProceduralMemory]:
    """
    Retrieve directives relevant to this specific intent + domain.
    Much more precise than the current 20-directive flat injection.
    """
    
    # Query: directives for this team that apply to this intent type and domain
    directives = ProceduralMemory.objects.filter(
        team_id=team_id,
        confidence__gte=0.6,
        contradiction_count__lt=3,  # Exclude contradicted directives
    ).filter(
        # Domain match: exact domain OR null domain (global rules)
        models.Q(domain=domain) | models.Q(domain__isnull=True)
    ).filter(
        # Intent type match: includes this intent type OR empty (applies to all)
        models.Q(applicable_intent_types__contains=[intent_type]) |
        models.Q(applicable_intent_types=[])
    ).order_by(
        "-confidence",          # Highest confidence first
        "-reinforcement_count", # Most reinforced
        "-last_reinforced_at"   # Most recent
    )[:max_directives]
    
    # Update last_used_at
    directives.update(last_used_at=timezone.now())
    
    return list(directives)


def format_directives_for_prompt(directives: list[ProceduralMemory]) -> str:
    """Format retrieved directives for system prompt injection."""
    
    if not directives:
        return ""
    
    sections = {
        DirectiveType.PLANNING_HEURISTIC: [],
        DirectiveType.RISK_PATTERN: [],
        DirectiveType.FAILURE_PATTERN: [],
        DirectiveType.SUCCESS_PATTERN: [],
        DirectiveType.INTEGRATION_RULE: [],
        DirectiveType.VOCABULARY: [],
    }
    
    for directive in directives:
        sections[directive.directive_type].append(directive.directive)
    
    output = "\n## Team Knowledge & Behavioral Guidelines\n"
    
    if sections[DirectiveType.VOCABULARY]:
        output += "\n### Team Vocabulary\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.VOCABULARY])
    
    if sections[DirectiveType.PLANNING_HEURISTIC]:
        output += "\n### Planning Preferences\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.PLANNING_HEURISTIC])
    
    if sections[DirectiveType.RISK_PATTERN]:
        output += "\n### Known Risk Patterns\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.RISK_PATTERN])
    
    if sections[DirectiveType.FAILURE_PATTERN]:
        output += "\n### What NOT To Do\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.FAILURE_PATTERN])
    
    if sections[DirectiveType.SUCCESS_PATTERN]:
        output += "\n### What Works Well\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.SUCCESS_PATTERN])
    
    if sections[DirectiveType.INTEGRATION_RULE]:
        output += "\n### Integration Rules\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.INTEGRATION_RULE])
    
    return output
```

---

## The Directive Quality Loop

Directives should decay if they stop being useful and strengthen when confirmed:

```python
# chat/tasks/directive_maintenance.py

@shared_task
def daily_directive_maintenance():
    """Runs nightly. Prunes low-quality directives, strengthens reinforced ones."""
    
    now = timezone.now()
    
    # 1. Prune: delete directives that are expired or frequently contradicted
    ProceduralMemory.objects.filter(
        models.Q(expires_at__lt=now) |  # Expired
        models.Q(contradiction_count__gte=3) |  # Contradicted too many times
        models.Q(confidence__lt=0.3)  # Confidence fallen too low
    ).delete()
    
    # 2. Decay: reduce confidence of unused directives
    thirty_days_ago = now - timedelta(days=30)
    ProceduralMemory.objects.filter(
        last_used_at__lt=thirty_days_ago,
        confidence__gt=0.4
    ).update(confidence=models.F("confidence") * 0.95)
    
    # 3. Promote: upgrade high-reinforcement directives to permanent
    ProceduralMemory.objects.filter(
        reinforcement_count__gte=5,
        confidence__gte=0.9,
        expires_at__isnull=False  # Currently set to expire
    ).update(expires_at=None)  # Make permanent


def contradict_directive(directive_id: str, episode_id: str):
    """
    Called when an episode's outcome contradicts an existing directive.
    Reduces confidence; triggers deletion if too many contradictions.
    """
    directive = ProceduralMemory.objects.get(id=directive_id)
    directive.contradiction_count += 1
    directive.confidence = max(0.0, directive.confidence - 0.15)
    directive.source_episode_ids.append(f"contradiction:{episode_id}")
    directive.save()
```

---

## Example: What This Looks Like After 30 Days

After a team has used TeamOS for 30 days running engineering sprints, their injected directives for `domain=engineering_sprint, intent_type=plan/create` might look like:

```
## Team Knowledge & Behavioral Guidelines

### Team Vocabulary
- "spike" = research task with 2-day timebox (do not make it longer)
- "hardened" = task that has passed QA and can be released
- "P0" = blocking issue, always assign to senior member

### Planning Preferences
- This team works in 2-week sprints — never create milestones longer than 14 days
- Always create a "sprint retrospective" task at the end of each sprint
- Assign DevOps tasks to user_id [xyz] unless they are on PTO

### Known Risk Patterns
- Backend API tasks always take 30% longer than estimated for this team — add buffer
- Tasks touching the authentication module frequently conflict — serialize them

### What NOT To Do
- Do not create more than 8 tasks per sprint for individual developers
- Do not assign frontend and backend tasks to the same developer in the same sprint

### What Works Well
- Breaking database migration into separate pre/post deployment tasks reduces conflicts
- Creating a "design review" milestone before development starts has high completion rate
```

None of this is hardcoded. It was learned from 30 days of this team's actual usage.

---

## Integration Into AgentCore

```python
# chat/agents/agent_core.py

def build_system_prompt(
    self,
    intent_type: str,
    domain: str
) -> str:
    base_prompt = SPECIALIST_PROMPTS[self.specialist]
    
    # Enhanced: get domain + intent-specific directives
    directives = get_relevant_directives(
        team_id=self.team_id,
        intent_type=intent_type,
        domain=domain,
        max_directives=8  # Down from 20, but much more relevant
    )
    
    directive_text = format_directives_for_prompt(directives)
    
    return base_prompt + directive_text
```

---

## Migration From Current System

Your current system stores directives in `AgentMemory` as key-value pairs. Migrate them:

```python
# One-time migration script
def migrate_existing_directives(team_id: str):
    old_directives = AgentMemory.objects.filter(
        team_id=team_id,
        key__startswith="behavioral_directive_"
    )
    
    for mem in old_directives:
        ProceduralMemory.objects.create(
            team_id=team_id,
            directive=mem.value,
            directive_type=DirectiveType.PLANNING_HEURISTIC,  # Default type
            domain=None,  # Global — no domain tag yet
            applicable_intent_types=[],  # Applies to all
            confidence=0.7,
            reinforcement_count=1,
            extraction_method="migrated",
            expires_at=mem.expires_at
        )
```

---

## Files to Touch

```
backend/
├── chat/
│   ├── models.py                      (add ProceduralMemory model)
│   ├── memory/
│   │   ├── domain_inferencer.py       (new)
│   │   ├── injection.py               (new — replaces flat directive injection)
│   │   └── episodic.py               (modified — add domain inference on store)
│   ├── tasks/
│   │   ├── retrospective.py           (modified — add domain tagging + success analysis)
│   │   └── directive_maintenance.py   (new — nightly quality loop)
│   └── agents/
│       └── agent_core.py              (modified — use precision injection)
└── migrations/                        (new migration for ProceduralMemory)
```

---

## Done Criteria

- `ProceduralMemory` model is in production with domain + type fields
- All episodes get domain tagged at storage time
- Retrospective task extracts success patterns, not just failure patterns
- System prompt injection uses domain + intent-filtered directives (max 8, not 20)
- Directive quality scores are visible in admin dashboard
- Nightly maintenance task prunes expired/contradicted directives
- After 2 weeks, you can query: "what has the system learned about our engineering sprints?"

**Time estimate: 2.5 weeks for one engineer.**

---

*Next: Topic 6 — Hybrid Fast-Path Intent Classifier*
