# Topic 6: Hybrid Fast-Path Intent Classifier
**TeamOS Deep Dive Series — Phase 2, Weeks 10–14**

> Classification is the first thing that happens on every single user message. If it's slow, everything is slow. If it's wrong, everything downstream is wrong. Right now, it's probably both slower and less accurate than it needs to be.

---

## What Your Current Classifier Does

From your README: "intent classification → RAG retrieval → specialist agent routing."

The current classifier uses "regex + occasional LLM classification inside `universal_stream.py`." This means:

- Simple messages (those matching regex patterns) are classified in <5ms.
- Ambiguous messages that don't match patterns trigger an LLM call — adding 500–1500ms before any actual agent work begins.
- The classification output is minimal: which specialist to route to. It doesn't output complexity, domains, required capabilities, or parallelizability — all of which the Dynamic Crew Factory (Topic 4) needs.

Two problems: **it's slow on ambiguous inputs** (the most interesting inputs) and **it produces too little metadata** for downstream decision-making.

---

## The Hybrid Architecture

Three layers, each faster than the last, each handling a different slice of inputs:

```
User Message
     │
     ▼
Layer 1: Exact Match Cache (< 1ms)
  → Hit: return cached classification
  → Miss: continue
     │
     ▼
Layer 2: Embedding Similarity (30–80ms)
  → Confidence > 0.82: return classification
  → Confidence ≤ 0.82: continue
     │
     ▼
Layer 3: LLM Classification (400–900ms)
  → Always returns full IntentSchema
  → Result stored back in embedding index for future
     │
     ▼
Full IntentSchema Output
```

**Target:** 80%+ of messages handled by Layers 1 or 2, LLM called only for genuinely novel/ambiguous inputs.

---

## Layer 1: Exact Match Cache

```python
# chat/intent/cache.py
import redis
import hashlib

redis_client = redis.Redis.from_url(settings.REDIS_URL)

CACHE_TTL = 60 * 60 * 4  # 4 hours

def cache_key(message: str, team_id: str) -> str:
    # Include team_id so team-specific patterns can be cached separately
    content = f"{team_id}:{message.strip().lower()}"
    return f"intent_cache:{hashlib.sha256(content.encode()).hexdigest()}"

def get_cached_intent(message: str, team_id: str) -> IntentSchema | None:
    key = cache_key(message, team_id)
    cached = redis_client.get(key)
    
    if cached:
        return IntentSchema(**json.loads(cached))
    return None

def cache_intent(message: str, team_id: str, intent: IntentSchema):
    key = cache_key(message, team_id)
    redis_client.setex(key, CACHE_TTL, json.dumps(asdict(intent)))
```

This layer handles repeated identical messages. More useful than it sounds: in team environments, multiple users often ask the same things ("what's the status of project X", "create a sprint for Q3", "summarize this week's tasks"). Cache hit rate after 2 weeks typically hits 15–25% of all messages.

---

## Layer 2: Embedding Similarity Classifier

This is the core upgrade. You maintain an indexed set of example messages with known classifications. New messages are compared against this index via cosine similarity. If the closest match is confident enough, return that classification without an LLM call.

### The Example Index

```python
# chat/intent/examples.py

INTENT_EXAMPLES = [
    # plan/create examples
    {
        "message": "create a product launch plan for Q3",
        "intent": IntentSchema(
            intent_type="plan/create",
            complexity="high",
            domains=["product"],
            required_capabilities=["web_search", "plan_creation", "risk_analysis"],
            parallelizable=True,
            estimated_rounds=8,
            requires_external=False,
            confidence=1.0
        )
    },
    {
        "message": "build me a 6-week engineering roadmap",
        "intent": IntentSchema(
            intent_type="plan/create",
            complexity="high",
            domains=["engineering"],
            required_capabilities=["plan_creation", "risk_analysis"],
            parallelizable=True,
            estimated_rounds=7,
            requires_external=False,
            confidence=1.0
        )
    },
    # wiki/query examples
    {
        "message": "what does our onboarding process look like",
        "intent": IntentSchema(
            intent_type="wiki/query",
            complexity="low",
            domains=["hr", "operations"],
            required_capabilities=["wiki_search"],
            parallelizable=False,
            estimated_rounds=2,
            requires_external=False,
            confidence=1.0
        )
    },
    # research/analyze examples
    {
        "message": "research our top 5 competitors and analyze their pricing",
        "intent": IntentSchema(
            intent_type="research/analyze",
            complexity="medium",
            domains=["product", "marketing"],
            required_capabilities=["web_search", "wiki_write"],
            parallelizable=True,
            estimated_rounds=5,
            requires_external=False,
            confidence=1.0
        )
    },
    # task/create examples
    {
        "message": "add a task to fix the login bug in project alpha",
        "intent": IntentSchema(
            intent_type="task/create",
            complexity="low",
            domains=["engineering"],
            required_capabilities=["plan_creation"],
            parallelizable=False,
            estimated_rounds=2,
            requires_external=False,
            confidence=1.0
        )
    },
    # ... 50-100 more examples covering all intent types
]
```

You need at least 10 examples per intent type for reliable coverage. Start with 8 intent types × 10 examples = 80 examples minimum.

### Building the Index

```python
# chat/intent/embedding_classifier.py
import numpy as np
from sentence_transformers import SentenceTransformer

class EmbeddingClassifier:
    
    def __init__(self):
        # Use a small, fast model — accuracy vs speed tradeoff
        # all-MiniLM-L6-v2: 22MB, 14k sentences/sec, good accuracy
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        self.index = None
        self.examples = []
        self._build_index()
    
    def _build_index(self):
        """Pre-compute embeddings for all examples at startup."""
        messages = [ex["message"] for ex in INTENT_EXAMPLES]
        embeddings = self.model.encode(messages, batch_size=32, normalize_embeddings=True)
        
        self.index = embeddings  # shape: (n_examples, 384)
        self.examples = INTENT_EXAMPLES
    
    def classify(self, message: str, confidence_threshold: float = 0.82) -> tuple[IntentSchema | None, float]:
        """
        Returns (IntentSchema, confidence) if above threshold, else (None, confidence).
        """
        # Encode query
        query_embedding = self.model.encode([message], normalize_embeddings=True)[0]
        
        # Cosine similarity against all examples
        similarities = np.dot(self.index, query_embedding)  # shape: (n_examples,)
        
        best_idx = np.argmax(similarities)
        best_score = float(similarities[best_idx])
        
        if best_score >= confidence_threshold:
            matched_intent = self.examples[best_idx]["intent"]
            # Adjust confidence based on similarity score
            matched_intent.confidence = best_score
            return matched_intent, best_score
        
        return None, best_score
    
    def add_example(self, message: str, intent: IntentSchema):
        """
        Add a new example to the index (from LLM-classified messages).
        Expands coverage over time without manual curation.
        """
        new_embedding = self.model.encode([message], normalize_embeddings=True)[0]
        
        self.index = np.vstack([self.index, new_embedding])
        self.examples.append({"message": message, "intent": intent})

# Singleton — loaded once at startup
_classifier = None

def get_classifier() -> EmbeddingClassifier:
    global _classifier
    if _classifier is None:
        _classifier = EmbeddingClassifier()
    return _classifier
```

---

## Layer 3: LLM Classifier (Fallback)

Only runs when the embedding classifier isn't confident enough. Produces the full `IntentSchema`.

```python
# chat/intent/llm_classifier.py

LLM_CLASSIFICATION_PROMPT = """
You are an intent classifier for TeamOS, an agentic workspace platform.

## User Message
{message}

## Team Context (recent activity)
{team_context}

## Intent Types
- plan/create: Creating new projects, plans, roadmaps, sprints
- plan/update: Modifying existing plans, tasks, milestones
- plan/query: Querying plan status, progress, assignments
- wiki/query: Looking up knowledge base information
- wiki/update: Creating or updating wiki pages
- research/analyze: Web research, competitive analysis, data investigation
- task/create: Creating individual tasks or subtasks
- task/update: Updating task status, assignments, dates
- chat/general: Conversational questions, explanations, summaries
- integration/action: Actions involving external tools (GitHub, Slack, etc.)

## Required Capabilities
Choose from: web_search, wiki_search, wiki_write, plan_creation, plan_read,
task_management, risk_analysis, knowledge_graph, integration_github,
integration_slack, integration_jira, integration_linear, integration_notion, data_analysis

## Output (JSON only, no preamble)
{{
  "intent_type": "plan/create",
  "complexity": "high",
  "domains": ["product", "engineering"],
  "required_capabilities": ["web_search", "plan_creation", "risk_analysis"],
  "parallelizable": true,
  "estimated_rounds": 8,
  "requires_external": false,
  "confidence": 0.91,
  "reasoning": "one sentence explanation"
}}
"""

def llm_classify(message: str, team_id: str) -> IntentSchema:
    # Get lightweight team context (recent 3 intents, current active project)
    team_context = get_team_context(team_id)
    
    response = llm_call(
        messages=[{
            "role": "user",
            "content": LLM_CLASSIFICATION_PROMPT.format(
                message=message,
                team_context=team_context
            )
        }],
        operation="intent_classification",
        priority="fast",  # Use Flash model — this must be fast
        max_tokens=200
    )
    
    result = json.loads(response)
    intent = IntentSchema(**result)
    
    # Feed back into embedding index so similar messages don't need LLM next time
    classifier = get_classifier()
    if intent.confidence >= 0.8:
        classifier.add_example(message, intent)
    
    return intent
```

---

## The Orchestrator: Putting It All Together

```python
# chat/intent/classifier.py

class HybridIntentClassifier:
    
    EMBEDDING_CONFIDENCE_THRESHOLD = 0.82
    
    def classify(self, message: str, team_id: str) -> IntentSchema:
        
        # Layer 1: Cache
        cached = get_cached_intent(message, team_id)
        if cached:
            return cached  # < 1ms
        
        # Layer 2: Embedding similarity
        classifier = get_classifier()
        intent, score = classifier.classify(message, self.EMBEDDING_CONFIDENCE_THRESHOLD)
        
        if intent:
            # Cache for next time
            cache_intent(message, team_id, intent)
            return intent  # 30–80ms
        
        # Layer 3: LLM fallback
        intent = llm_classify(message, team_id)
        cache_intent(message, team_id, intent)
        return intent  # 400–900ms (but infrequent)
    
    def classify_with_metadata(self, message: str, team_id: str) -> ClassificationResult:
        """Returns intent plus routing metadata for logging."""
        
        start = time.monotonic()
        
        # Layer 1
        cached = get_cached_intent(message, team_id)
        if cached:
            return ClassificationResult(
                intent=cached,
                layer_used=1,
                latency_ms=int((time.monotonic() - start) * 1000)
            )
        
        # Layer 2
        intent, score = get_classifier().classify(message, self.EMBEDDING_CONFIDENCE_THRESHOLD)
        if intent:
            cache_intent(message, team_id, intent)
            return ClassificationResult(
                intent=intent,
                layer_used=2,
                similarity_score=score,
                latency_ms=int((time.monotonic() - start) * 1000)
            )
        
        # Layer 3
        intent = llm_classify(message, team_id)
        cache_intent(message, team_id, intent)
        return ClassificationResult(
            intent=intent,
            layer_used=3,
            similarity_score=score,
            latency_ms=int((time.monotonic() - start) * 1000)
        )
```

---

## Integration Into Universal Stream

```python
# chat/universal_stream.py

classifier = HybridIntentClassifier()

def process_message(session_id, user_message, team_id, mode):
    
    # Replace old regex + LLM classification
    classification = classifier.classify_with_metadata(user_message, team_id)
    intent = classification.intent
    
    # Log classification metadata to LangSmith
    log_classification_event(
        message=user_message,
        intent=intent,
        layer_used=classification.layer_used,
        latency_ms=classification.latency_ms
    )
    
    # Route based on full intent schema
    if intent.complexity in ["low", "medium"] and len(intent.required_capabilities) <= 2:
        # Single agent path
        specialist = map_intent_to_specialist(intent)
        return run_single_agent(session_id, user_message, specialist, team_id)
    else:
        # Crew path (Topic 4)
        crew = compose_crew(intent, user_message)
        return run_crew(session_id, user_message, intent, crew, team_id)
```

---

## Expanding the Example Index Over Time

The embedding classifier improves automatically as more LLM classifications are added to the index. But you can also curate it:

```python
# management/commands/expand_intent_examples.py

class Command(BaseCommand):
    help = "Review LLM-classified messages and promote good ones to the static example set"
    
    def handle(self, *args, **options):
        # Pull recent LLM-classified messages with high confidence
        recent = IntentClassificationLog.objects.filter(
            layer_used=3,
            intent_confidence__gte=0.88,
            created_at__gte=timezone.now() - timedelta(days=7)
        ).order_by("-intent_confidence")[:50]
        
        print(f"Found {len(recent)} high-confidence LLM classifications from last 7 days")
        print("Review and add to INTENT_EXAMPLES in chat/intent/examples.py")
        
        for log in recent:
            print(f"\n---")
            print(f"Message: {log.message}")
            print(f"Intent: {log.intent_type} ({log.complexity})")
            print(f"Capabilities: {log.required_capabilities}")
            print(f"Confidence: {log.intent_confidence:.2f}")
```

Run this weekly during the first month. After 4–6 weeks of real usage, your embedding classifier coverage will reach 90%+ for your team's actual message patterns.

---

## Classification Logging

```python
# chat/models.py

class IntentClassificationLog(models.Model):
    """Audit trail for classification decisions. Used to improve the index."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    team = models.ForeignKey("accounts.Team", on_delete=models.CASCADE)
    session_id = models.CharField(max_length=255)
    
    message_hash = models.CharField(max_length=64)  # SHA256, no raw message storage
    
    # Classification result
    intent_type = models.CharField(max_length=100)
    complexity = models.CharField(max_length=20)
    domains = models.JSONField()
    required_capabilities = models.JSONField()
    intent_confidence = models.FloatField()
    
    # Routing decision
    layer_used = models.IntegerField()         # 1, 2, or 3
    similarity_score = models.FloatField(null=True)  # Layer 2 score if used
    latency_ms = models.IntegerField()
    
    # Outcome (filled in after agent completes)
    agent_outcome = models.CharField(max_length=50, null=True)  # success/failure/partial
    crew_used = models.BooleanField(null=True)
    crew_composition = models.JSONField(null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            models.Index(fields=["team", "intent_type", "created_at"]),
            models.Index(fields=["layer_used", "created_at"]),
        ]
```

---

## Performance Targets

|
 Layer 
|
 % of Messages (Target) 
|
 Latency 
|
 Cost Per Call 
|
|
---
|
---
|
---
|
---
|
|
 Layer 1 (cache) 
|
 15–25% 
|
 < 1ms 
|
 $0 
|
|
 Layer 2 (embedding) 
|
 60–70% 
|
 30–80ms 
|
 $0 
|
|
 Layer 3 (LLM) 
|
 10–20% 
|
 400–900ms 
|
 ~$0.0003 
|
|
**
Weighted average
**
|
**
100%
**
|
**
~60ms
**
|
**
~$0.00006
**
|

Compare to current: LLM fires on every ambiguous message (likely 40%+ of traffic). At $0.0003 per call and 1000 messages/day, that's $120/month just on classification. The hybrid approach reduces that to ~$18/month while being faster.

---

## Monitoring in LangSmith

After deploying, track these metrics weekly:

**Layer distribution**: What % of messages hit Layer 1 / 2 / 3? Target: Layer 3 < 20%. If Layer 3 > 30%, your example index needs expansion.

**Classification accuracy**: When Layer 2 fires with similarity score 0.82–0.90 (the boundary zone), does the downstream agent succeed or fail? If fail rate is elevated in this zone, raise the threshold to 0.88.

**Intent type distribution**: Are certain intent types always falling through to Layer 3? That means you need more examples for those types.

---

## Files to Create / Modify

```
backend/
├── chat/
│   ├── intent/
│   │   ├── __init__.py              (new)
│   │   ├── classifier.py            (new — HybridIntentClassifier)
│   │   ├── embedding_classifier.py  (new — EmbeddingClassifier)
│   │   ├── llm_classifier.py        (new — LLM fallback)
│   │   ├── cache.py                 (new — Redis cache layer)
│   │   ├── examples.py              (new — 80+ labeled examples)
│   │   └── schema.py                (new — IntentSchema dataclass)
│   ├── models.py                    (modified — add IntentClassificationLog)
│   └── universal_stream.py          (modified — replace old classifier)
├── management/
│   └── commands/
│       └── expand_intent_examples.py (new — weekly curation helper)
└── requirements.txt                  (add sentence-transformers)
```

---

## Done Criteria

- Layer distribution visible in LangSmith: cache hit rate, embedding hit rate, LLM fallback rate
- Layer 3 (LLM) fires on < 25% of messages after 2 weeks of real usage
- Average classification latency < 100ms (measured in LangSmith)
- Full `IntentSchema` is output (not just specialist name) — used by Crew Factory
- `IntentClassificationLog` records every classification for weekly review
- Weekly curation command runs and feeds good LLM classifications back into examples

**Time estimate: 2 weeks for one engineer.**

---

## Full Implementation Order Summary (All 6 Topics)

```
Week 1–2   → Topic 1: LangSmith tracing across entire backend
Week 2–6   → Topic 2: LangGraph planning engine migration
Week 4–6   → Topic 3: Tiered Guardian Agent (parallel to Topic 2)
Week 6–10  → Topic 4: Dynamic Crew Factory
Week 8–12  → Topic 5: Domain-tagged procedural memory
Week 10–14 → Topic 6: Hybrid intent classifier
```

After Week 14, you have:
- Full observability into every agent action
- A resumable, inspectable planning engine
- A safety layer that doesn't kill latency
- True multi-agent crew orchestration
- A memory system that learns per domain
- A classifier that costs almost nothing to run

That's a genuinely 2028-grade agentic system built on top of your existing, working foundation. Nothing was thrown away. Everything was evolved.
