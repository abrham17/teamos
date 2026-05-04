# TeamOS — LM Wiki: Governance & Review Workflow

Governance is what separates a "messy notebook" from a "Reliable Knowledge Base." TeamOS treats knowledge with the same rigor as source code, implementing a **"Knowledge PR"** workflow for all incoming information.

---

## 1. The "Knowledge PR" Lifecycle

When information enters the system (via URL, File, or Repo) and **Auto-Approve** is disabled, it enters the Governance Pipeline:

### Step 1: Pre-Merge Analysis
*   **Semantic Search**: The system finds the most conceptually related pages in the existing graph.
*   **Contradiction Detection**: An LLM compares the new data with these related pages to identify clashing claims (e.g., *"Source says Project X ends in June, but Wiki says August"*).

### Step 2: Review Required State
*   The ingestion job halts and is assigned the `review_required` status.
*   A **WikiChangeSet** is created, holding the proposed additions and a JSON summary of contradictions found.

### Step 3: Human-in-the-Loop Approval
*   Users review the **GitHub-style Diff** (Proposed vs. Existing).
*   **Resolution**: The user can `Accept All`, `Decline`, or `Selectively Merge` the new knowledge into the wiki.

---

## 2. The Knowledge Activity Feed

Every evolution of the team's brain is recorded in the **Knowledge Activity Feed**. This provides a transparent audit trail of how the wiki is compounding.

### Event Types
*   **AI Merge**: Automatically recorded when a source is synthesized into an existing page.
*   **AI Create**: Recorded when a new entity is discovered and a page is created.
*   **Manual Edit**: Tracks human contributions to the wiki.
*   **Conflict Resolved**: Logs when a human resolves a contradiction between two sources.

---

## 3. High-End Governance Features

### Global Health Scan (Stale Info Detection)
The system periodically scans the entire wiki for "Knowledge Decay." If an old page's claims are contradicted by a high-confidence new document, the system flags the old page as "Possibly Stale."

### Exact Source Grounding
Because we persist `raw_content`, every approved change is linked back to the original evidence. If a team member questions a merge, they can click a single button to see the raw PDF or Repo file that justified the change.

---

## 4. Technical Implementation

*   **Logic**: `_analyze_governance` in [pipeline.py](file:///home/abrhame/projects/mem2/teamos/backend/ingest/pipeline.py).
*   **Models**: `WikiChangeSet` and `KnowledgeActivity` in [ingest/models.py](file:///home/abrhame/projects/mem2/teamos/backend/ingest/models.py).
*   **State Machine**: `pending` -> `running` -> `review_required` -> `done`.

### Code Reference
*   [Ingestion Pipeline](file:///home/abrhame/projects/mem2/teamos/backend/ingest/pipeline.py) — The governance orchestrator.
*   [Ingest Models](file:///home/abrhame/projects/mem2/teamos/backend/ingest/models.py) — The governance data schema.












Here is the comprehensive backend audit for `teamos`. I focused on inconsistencies, logical errors, security issues, and production-failure risks. Severities use **CRITICAL / HIGH / MEDIUM / LOW**.

---

# TeamOS Backend Audit — Inconsistencies, Bugs & Production Risks

## 1. Build / Runtime — Will-not-start or hard-fail in prod

### 🔴 CRITICAL — `qdrant-client` is imported but missing from `requirements.txt`
`backend/ingest/vectors.py` imports `qdrant_client.QdrantClient` and is loaded at module import (a global `vector_store = VectorStore()` runs at import time), but `requirements.txt` has **no `qdrant-client` line**.

```7:8:backend/ingest/vectors.py
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
```
A clean `pip install -r requirements.txt && python manage.py migrate` will fail with `ModuleNotFoundError`. Docker builds will crash. **Fix:** add `qdrant-client>=1.x.y` (and likely `tiktoken` if you ever add it later).

### 🔴 CRITICAL — Suspicious dependency `django-channels==0.7.0`
`backend/requirements.txt` line 23 has `django-channels==0.7.0` alongside the real `channels==4.3.2`. The PyPI package `django-channels` is unrelated to Django Channels and is essentially abandoned/typosquat-prone. Remove it.

### 🔴 CRITICAL — Two settings worlds; legacy `settings.py` still importable
`backend/teamos_project/settings.py` is a Django starter template (DEBUG=True, SQLite, hardcoded `SECRET_KEY`, missing `corsheaders`, `channels`, `accounts.User`, etc.). The real app uses `settings/base.py` + `development.py` / `production.py`.

```26:30:backend/teamos_project/settings.py
SECRET_KEY = 'django-insecure-%m=6(vxy^kclb#z7^m8l=37(7-egu(5zbcu%@m-5gd*7y0bk8q'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True
```

WSGI defaults to **this** module:
```14:15:backend/teamos_project/wsgi.py
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'teamos_project.settings')
```
Anything that uses `wsgi.py` or omits an explicit `DJANGO_SETTINGS_MODULE` will boot the insecure file. Delete the legacy `settings.py` (or convert it to a shim that imports from `settings.development`) and align all entrypoints.

### 🟠 HIGH — `manage.py`, `celery.py`, `asgi.py` default to `settings.development`
```9:10:backend/manage.py
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'teamos_project.settings.development')
```
```6:7:backend/teamos_project/celery.py
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "teamos_project.settings.development")
```
Combined with `Procfile` line 3 (`release: python manage.py migrate`), prod **migrations run against the dev settings (SQLite, in-memory channel layer, eager Celery)**. Either invert defaults to production or require an explicit env var (and fail fast).

### 🟠 HIGH — `docker-compose.yml` cannot actually use the Postgres service
```48:54:docker-compose.yml
    environment:
      - DEBUG=1
      - SECRET_KEY=prod_secret_key_here
      - DATABASE_URL=postgres://teamos_user:teamos_password@db:5432/teamos
      - REDIS_URL=redis://redis:6379/0
      - QDRANT_URL=http://qdrant:6333
```
- `DJANGO_SETTINGS_MODULE` is unset → loads `development.py`, which **overrides DATABASES to SQLite**, ignoring `DATABASE_URL`. The `db` service is never used.
- The env var name expected for the secret is `DJANGO_SECRET_KEY`, not `SECRET_KEY`.
- `worker` `depends_on: backend` only — should depend on `db`/`redis`/`qdrant` healthy.
- No Beat service; the scheduled `billing.tasks.reconcile_pending_billing_webhooks` never runs.

### 🟠 HIGH — Production `SECRET_KEY` may be `None`
```14:15:backend/teamos_project/settings/production.py
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
```
No fail-fast assert. `ALLOWED_HOSTS` from `.split(",")` produces `[""]` when the env is unset, which silently drops to an unusable host whitelist. Same shape for `CORS_ALLOWED_ORIGINS`.

### 🟠 HIGH — Dockerfile runs as root, no healthcheck, no multistage
```1:34:backend/Dockerfile
FROM python:3.12-slim
...
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "teamos_project.asgi:application"]
```
Add a non-root `USER`, multi-stage build, `HEALTHCHECK`, and explicit Daphne workers/timeouts. Also `runtime.txt` says `python-3.12.8` while CI uses 3.11 — pick one.

### 🟡 MEDIUM — Procfile lacks `celery beat`
`CELERY_BEAT_SCHEDULE` is defined in `settings/base.py` but only `web` and `worker` processes are declared. Periodic billing reconciliation will never fire in production.

### 🟡 MEDIUM — `.env.production.example` has plausibly real Groq key string
```20:22:backend/.env.production.example
GROQ_API_KEY=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
OPENAI_API_KEY=sk-proj-your_openai_key
```
If that Groq key is real, **rotate it immediately**. Use obvious placeholders (`REPLACE_ME`).

---

## 2. Authentication & Tenancy — Cross-tenant / IDOR risk

### 🔴 CRITICAL — WebSocket presence has **no team membership check**
```12:13:backend/presence/consumers.py
self.team_id = self.scope['url_route']['kwargs']['team_id']
self.room_group_name = f'presence_{self.team_id}'
```
Any authenticated user can subscribe to `/ws/presence/<any-team-uuid>/` and receive every team's presence broadcasts. Add a DB-async check that `TeamMember(team_id=self.team_id, user=self.user)` exists, otherwise `await self.close()`.

### 🔴 CRITICAL — JWT/Clerk users cannot use WebSockets at all
```12:17:backend/teamos_project/asgi.py
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
```
`AuthMiddlewareStack` only handles Django sessions. Frontend is Clerk-JWT/cookie-JWT, so `self.scope["user"]` is **always `AnonymousUser`** and the consumer immediately `close()`s. Presence is functionally broken in prod. Add a JWT/Clerk middleware that decodes the token from the `Sec-WebSocket-Protocol` header or query string.

### 🔴 CRITICAL — Clerk auth allows arbitrary issuer in dev fallback
```96:127:backend/accounts/authentication.py
def _derive_issuer_and_jwks_from_token(self, token: str) -> Tuple[str, str]:
    ...
    if not (host.endswith(".clerk.accounts.dev") or host.endswith(".clerk.com")):
        return "", ""
    return issuer, f"{issuer.rstrip('/')}/.well-known/jwks.json"
```
When `CLERK_ISSUER`/`CLERK_JWKS_URL` are unset in prod (e.g. typo, env loss), backend will validate **any token signed by any Clerk tenant** — i.e. an attacker creates their own Clerk dev instance and authenticates as a synthetic `sub`. This is fine for local dev, **catastrophic if it ever runs in prod**. Gate the fallback behind `settings.DEBUG` and refuse to authenticate otherwise.

### 🔴 CRITICAL — Clerk `get_or_create` collides on existing email
```40:49:backend/accounts/authentication.py
user, _created = User.objects.get_or_create(
    clerk_user_id=clerk_user_id,
    defaults={
        "username": email or f"clerk_{clerk_user_id}",
        "email": email or f"{clerk_user_id}@clerk.local",
```
`User.email` is `unique=True`. If a user previously registered via `RegisterView` with the same email, the Clerk login will **IntegrityError** instead of linking accounts. Same for `username`. Lookup by email first, then attach `clerk_user_id`.

### 🟠 HIGH — `IsTeamMember` returns `True` when `team_id` cannot be resolved
```19:32:backend/accounts/permissions.py
team_id = _resolve_team_id(view, request)
if not team_id:
    return True
```
Any view that uses `IsTeamMember` without `<team_id>` in URL/data/query becomes effectively `IsAuthenticated`. Same logic in `CanEditWiki` / `CanEditPlans`. Default to `False` (or require the URL kwarg).

### 🟠 HIGH — Mass-assignment in `update_task` / `update_milestone` / `update_project`
```89:96:backend/planning/services.py
def update_task(task: Task, payload: dict) -> Task:
    deps = payload.pop("dependency_ids", None)
    for field, value in payload.items():
        setattr(task, field, value)
```
Combined with `PlanningProjectDetailView.patch`, raw `t_data` is forwarded as `payload` (bypassing `TaskWriteSerializer.validate_assignee_id`):
```138:157:backend/planning/views.py
"assignee_id": t_data.get("assignee_id") or t_data.get("assigneeId"),
...
update_task(task, payload)
```
A user can assign tasks to **any** user UUID (including users from other tenants) by including their id in the bulk patch payload. Validate every payload through the serializer or call `_resolve_assignee` here too.

### 🟠 HIGH — `dependency_ids` are never team/project scoped
```82:86:backend/planning/services.py
deps = payload.pop("dependency_ids", [])
task = Task.objects.create(project=project, created_by=user, **payload)
if deps:
    task.dependencies.set(deps)
```
Any user-supplied UUID is set as a dependency, regardless of team or project. Cross-team dep edges silently get created. Filter to `Task.objects.filter(id__in=deps, project__team=project.team)`.

### 🟠 HIGH — `PlanningProjectDetailView.patch` adds project members from any team
```186:194:backend/planning/views.py
user = User.objects.get(id=u_id)
if remove:
    remove_project_member(project=project, user=user)
else:
    add_project_member(project=project, user=user, role=role)
```
No team-membership check; an owner can add any user from any other team as a `ProjectMember`, leaking project visibility to outsiders. Restrict to `TeamMember.objects.filter(team=project.team, user_id=u_id).exists()`.

### 🟡 MEDIUM — Long-lived JWTs in cookies
```37:38:backend/accounts/views.py
response.set_cookie("refresh_token", str(refresh), httponly=True, samesite="Lax", max_age=30 * 86400)
response.set_cookie("access_token", str(refresh.access_token), httponly=True, samesite="Lax", max_age=7 * 86400)
```
- `secure=False` (browser default) — `set_jwt_cookies` ignores `SIMPLE_JWT["AUTH_COOKIE_SECURE"]`. Cookies will be sent over HTTP if anyone enters via http://. Hard-code `secure=request.is_secure()` (or use `settings.SIMPLE_JWT`).
- 7-day access tokens with no rotation are too long.
- `LogoutView.post` only deletes cookies; Simple-JWT supports a blacklist app, otherwise stolen access tokens stay valid for 7 days.

### 🟡 MEDIUM — `ClerkJWTAuthentication` writes user updates on every request
Lines 51-66 update first/last name/avatar and `save(update_fields=...)` on every request that has any change. Two concurrent requests + last-write-wins races + extra DB writes on every API call. Cache by `clerk_user_id` for 5 min, or only update on first auth/update.

### 🟡 MEDIUM — No DRF throttling
`REST_FRAMEWORK` has no `DEFAULT_THROTTLE_CLASSES`. Login, register, ingest, chat-stream, TTS endpoints are all uncapped and will get abused. Add at least `ScopedRateThrottle` for `login`, `register`, `chat:query`, `ingest:url`, `tts`.

### 🟡 MEDIUM — `LoginSerializer.authenticate(username=email)` works only because `USERNAME_FIELD = "email"`, but signup allows a separate `username`. The mismatch will burn whoever changes USERNAME_FIELD later.

---

## 3. Billing — Money-related correctness

### 🔴 CRITICAL — Stripe webhook signature verification is **wrong**
```271:286:backend/billing/providers.py
def verify_and_parse_webhook(self, *, headers, body_bytes: bytes) -> dict:
    secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "") ...
    signature = headers.get("Stripe-Signature", "")
    ...
    digest = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(digest, signature):
        raise BillingError("Invalid Stripe webhook signature.")
```
Stripe's signature is `t=<ts>,v1=<sig>` and signs `f"{ts}.{body}"`. This implementation:
- never parses `t=` and `v1=`,
- never enforces a timestamp tolerance window,
- HMACs the wrong payload,
so all real Stripe webhooks **fail with HTTP 400**, and worse, an attacker can craft any `Stripe-Signature` value because the comparison is against a `hexdigest(body)` they can compute (no secret known? — only if secret leaked, but the algorithm/format is also wrong). Either way, **billing on Stripe is unusable**. Use Stripe's `stripe.Webhook.construct_event` or implement the documented scheme.

### 🟠 HIGH — Paddle/Stripe `sync_subscription_state` trusts payload-supplied `team_id`/`plan_key`
```217:236:backend/billing/providers.py
team_id = data.get("team_id")
if not team_id:
    return None
subscription, _ = TeamSubscription.objects.get_or_create(team_id=team_id, defaults={"provider": "paddle"})
...
subscription.plan_key = str(data.get("plan_key") or subscription.plan_key)
subscription.status = str(data.get("status") or subscription.status)
```
`team_id` and `plan_key` come from `event["data"]` directly. Even with a valid signature, anyone who can call `create_checkout_session` can set `custom_data.team_id` to any UUID. After payment is settled for one team, a maliciously-crafted future webhook still references that team's id. The `get_or_create` will create subscriptions for arbitrary teams. Cross-check `team_id` against the saved checkout session / subscription record by Paddle `customer_id`.

Also `subscription.plan_key = str(data.get("plan_key") or ...)` writes any free-form string into the column; combined with `_apply_team_plan_from_subscription`, an attacker who can spoof a webhook can flip a team to `"enterprise"` for free.

### 🟠 HIGH — Webhook re-processing has no concurrency control
```126:145:backend/billing/views.py
webhook_event, created = BillingWebhookEvent.objects.get_or_create(
    provider=provider.provider_name,
    event_id=event_id,
    defaults={"event_type": event_type, "payload": event},
)
if not created and webhook_event.processed:
    return ok({"already_processed": True})
...
provider.sync_subscription_state(event=event)
webhook_event.processed = True
```
No `select_for_update`. Two concurrent retries can both run `sync_subscription_state`, double-applying state. Wrap the lookup + processing in `transaction.atomic()` + `select_for_update(of=("self",))`.

### 🟠 HIGH — `BillingReconcileView` exposes a job-trigger to anyone with `is_staff`
```150:159:backend/billing/views.py
class BillingReconcileView(APIView):
    permission_classes = [IsAuthenticated]
```
Add a dedicated permission class or restrict by allow-listed admin emails; staff-only is too coarse if the admin site is shared.

### 🟡 MEDIUM — Paddle live transaction creation drops customer linkage
`_paddle_create_transaction_live` never passes `customer_id`. Every checkout creates a new Paddle customer for the same team — duplicates customer records, breaks tax/refund flows, complicates dunning.

### 🟡 MEDIUM — Pricing rounding bug
```104:108:backend/billing/pricing.py
monthly = max(PRO_USD_MIN, min(PRO_USD_MAX, round(subtotal, 2)))
...
breakdown.append({"label": "Clamped to Pro band (100–300)", "usd": monthly})
```
`PRO_USD_MIN`/`PRO_USD_MAX` are ints (`100`, `300`). When the round-2 result is below `100.00`, `max` returns the int `100`, otherwise a float. UI/serialization will see mixed types, and `monthly_total_cents = int(round(monthly * 100))` loses the cents the customer was quoted (e.g., $99.99 → clamped to `100`, but $112.347 → `112.35`). Use `Decimal` consistently.

### 🟡 MEDIUM — Plan key mismatch
`PLAN_TIERS["pro"]["chat_provider"] = "anthropic"` (`settings/base.py`), but `get_llm_backend()` only returns `"groq"` or `"openai"`. Pro tier silently falls back to OpenAI — features marketed as "Anthropic Claude" never run.

---

## 4. Chat & Agent — Logical / robustness

### 🟠 HIGH — Streaming view + DB write on the response thread
```418:421:backend/chat/views.py
response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
response["Cache-Control"] = "no-cache"
response["X-Accel-Buffering"] = "no"
return response
```
The generator runs synchronously inside Daphne when consumed. Inside the generator there are **synchronous Django ORM calls** (`ChatMessage.objects.create`, `session.messages.count()`, `WikiPage.objects.only(...).get(...)`). Daphne will execute them on the event loop thread → blocks the worker, crashes under load. Either:
- run RAG/agent in a worker-side queue and stream from there, or
- wrap ORM access with `sync_to_async`, or
- switch chat to a real Channels consumer.

### 🟠 HIGH — Token quota only counts lifetime usage
```101:108:backend/teamos_project/entitlements.py
elif capability == "token_consume":
    used = (
        ChatTokenUsage.objects.filter(team=team).aggregate(total=Sum("total_tokens")).get("total")
        or 0
    )
```
Same for `ingest_job_create` and `export_job_create` — they count **all-time** rows. Once a free team hits 5 000 tokens or 10 ingest jobs, they can never use the product again. Use a rolling 30-day window:
```python
ChatTokenUsage.objects.filter(team=team, created_at__gte=now - timedelta(days=30))
```

### 🟠 HIGH — `ChatTokenUsage` is only persisted on success path
The `ChatMessage.objects.create(...)` and `ChatTokenUsage.objects.create(...)` for ask-mode happen after the entire stream runs without exception. If the LLM stream errors mid-way or the client disconnects, no usage is recorded → quota is bypassable by repeatedly cancelling streams.

### 🟠 HIGH — Streaming generator catches all errors but still leaks SSE
```414:417:backend/chat/views.py
except Exception as e:
    logger.error("Chat stream failed: %s", e)
    yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"
```
`str(e)` may include sensitive context (e.g., upstream OpenAI error messages with API key, internal model names). Sanitize.

### 🟠 HIGH — `_retrieve_wiki_citations` is N+1 against `WikiPage`
```112:117:backend/chat/views.py
if page_id:
    p = WikiPage.objects.only("slug").get(id=page_id)
    slug = p.slug
```
Each Qdrant hit triggers one DB query. Batch by `WikiPage.objects.filter(id__in=ids).values_list("id", "slug")` or include `slug` in the Qdrant payload.

### 🟡 MEDIUM — Agent tool budget is per-request but trivially bypassable
`MAX_TOOLS_PER_REQUEST = 24` and `MAX_TOOL_ROUNDS = 8` look fine, but:
- `wiki_create_page` calls `WikiPageCreateSerializer` and ignores quota check ordering on retries (the model can spam idempotency-keyless creates and consume the wiki page quota in a single chat turn).
- `_ingest_markdown` enqueues an ingest job on first call but doesn't re-check whether the previous one succeeded — easy to flood queue.
- The `idempotency_key` cache key uses `cache.add` with `timeout=300`. Restart the Redis cache instance and the same key is creatable again; not a real idempotency layer.

### 🟡 MEDIUM — `_chat_json_completion` swallows errors and returns defaults
A failed JSON response silently returns `{"type": "standard"}`/`{"contradictions": []}`. Governance becomes a no-op while the user thinks it ran. Surface or log distinctly.

### 🟡 MEDIUM — Hardcoded `[[wikilink]]` regex matches unrelated text
```44:45:backend/ingest/tasks.py
pattern = re.compile(r"\[\[([^\]]+)\]\]")
linked_titles = set(pattern.findall(page.content))
```
Inside fenced code blocks (` ``` ... ``` `) or inline code, `[[X]]` would still create graph edges. Strip code blocks first.

### 🟡 MEDIUM — `WikiPagePublishView.post` runs `run_pipeline` synchronously
```274:283:backend/wiki/views.py
try:
    run_pipeline(job, source_text=page.content or "", trace_id=trace_id)
```
LLM + Qdrant + governance inside a request → easy 30–60 s response, blocking workers, frequent gateway timeouts. Should `.delay()` to Celery and return 202.

---

## 5. Vector Store — Stale data / cost / startup risk

### 🔴 CRITICAL — Wiki re-index leaks vectors permanently in Qdrant
```47:54:backend/wiki/services/reindex.py
chunk_count = _persist_chunks(page, chunks)
chunks_data = [
    {"id": str(c.id), "content": c.content, "index": c.chunk_index, "title": page.title}
    for c in PageChunk.objects.filter(page=page)
]
vector_store.upsert_chunks(page.team_id, page.id, chunks_data)
```
`_persist_chunks` deletes all `PageChunk` rows then bulk-creates new ones with **new UUIDs**. Old Qdrant points (keyed by old UUIDs) are never deleted. After every save the Qdrant collection grows by N chunks of **stale** content, which then comes back as RAG citations. Compare with `planning/reindex.py:clear_project_chunks` — it does it correctly. Fix: before upserting, call `vector_store.delete_points(team_id, [old_chunk_ids])`, or filter Qdrant by `payload.page_id` and delete first.

### 🟠 HIGH — Module-level `vector_store = VectorStore()` connects on import
```197:197:backend/ingest/vectors.py
vector_store = VectorStore()
```
- If `QDRANT_URL` is unreachable at import (cold-start in worker), the import fails and the worker can't even register tasks.
- Every import path that touches `chat`, `wiki.services.reindex`, `ingest.pipeline`, `planning.reindex` pays an instantiation cost.
Make it lazy (`get_vector_store()` cached with `functools.lru_cache`).

### 🟠 HIGH — `_get_embedding` silently falls back to deterministic vectors
```86:92:backend/ingest/vectors.py
except OpenAIError as exc:
    logger.warning(
        "OpenAI embedding failed (%s: %s); using deterministic local fallback.",
        ...
    )
    return self._mock_embedding(text, dim=dim)
```
In production, an intermittent OpenAI 429 silently injects deterministic noise vectors next to real OpenAI embeddings in the same Qdrant collection. RAG relevance collapses, hard to detect. In `production.py` you correctly set `USE_DETERMINISTIC_EMBEDDINGS = False`, but this fallback bypasses that guard. Either re-raise or push to retry queue.

### 🟠 HIGH — `ensure_collection` makes a `get_collections()` round-trip on every search
```94:108:backend/ingest/vectors.py
collections = self.qdrant.get_collections().collections
if not any(c.name == collection_name for c in collections):
    ...
```
Every chat query → Qdrant list call. At 50 collections this is fine; at 5 000 teams it's painful and racy. Cache the set of known collections per worker; or call `get_collection(name)` and 404→create.

### 🟡 MEDIUM — Dead `qdrant_point_id`
`pipeline._persist_chunks` writes `qdrant_point_id=f"{page.id}:{idx}"` into `PageChunk`, but Qdrant points are actually upserted with `id=str(c.id)` (the chunk UUID). The stored value is wrong and used by no one. Confusing.

### 🟡 MEDIUM — `PageChunk.objects.filter(page=page)` in reindex isn't ordered → chunk indices in chunks_data and Qdrant payload may be in any DB-driven order; combined with bulk_create, OK for now but fragile.

### 🟡 MEDIUM — `payload.get("chunk_id")` is `None` for wiki citations
`upsert_chunks` does not include `"chunk_id"` in the payload (only plan upserts do). `chat/views.py` `_retrieve_wiki_citations` reads `payload.get("chunk_id")` and frontend will see `null`. Easy fix: add `"chunk_id": chunk["id"]` in `upsert_chunks`.

---

## 6. Ingestion — SSRF, decompression, and pipeline state

### 🟠 HIGH — SSRF: redirects + DNS rebind not blocked
```96:102:backend/ingest/extractors/url_fetch.py
response = requests.get(
    url,
    timeout=url_fetch_timeout_sec(),
    headers=headers,
    stream=True,
    allow_redirects=True,
)
```
`_assert_url_safe` resolves DNS and checks IPs once, but `requests.get` re-resolves and follows redirects without re-validating. Attacker-controlled DNS can rebind to internal IPs after the first lookup. And a 302 to `http://169.254.169.254/...` (cloud metadata) bypasses the check entirely.
Fix: set `allow_redirects=False` and walk redirects manually with `_assert_url_safe`, or pin the IP and pass `Host:` header (advanced). Also block port 22, 25, etc.

### 🟠 HIGH — `git clone <URL>` without `--` separator
```86:92:backend/ingest/extractors/repo.py
subprocess.run(
    ["git", "clone", "--depth", "1", repo_url, temp_dir],
    ...
)
```
A URL like `--upload-pack=touch /tmp/x` passes `_assert_url_safe` if it includes a host, but git also accepts options as positional args. Use `["git", "clone", "--depth", "1", "--", repo_url, temp_dir]` and reject `repo_url.startswith("-")`. Same for any other `subprocess` calls.

### 🟠 HIGH — `extract_code_zip` trusts metadata sizes (zip-bomb risk)
```40:44:backend/ingest/extractors/code_zip.py
if info.file_size > max_repo_file_bytes():
    logger.info("Skipping large zip member: %s", name)
    continue
try:
    body = zf.read(info).decode("utf-8", errors="ignore")
```
`info.file_size` is reported by the zip file; a malicious archive can claim 1 KB and decompress to GB. Use `zf.open(info)` and read in bounded chunks, or check `info.compress_size` ratio.

### 🟠 HIGH — Ingest pipeline race: `staging_file` deleted in two places
```208:217:backend/ingest/tasks.py
finally:
    try:
        job.refresh_from_db()
        if job.staging_file:
            job.staging_file.delete(save=False)
            job.staging_file = None
            job.save(update_fields=["staging_file", "updated_at"])
```
Plus `pipeline.run_pipeline` calls `_clear_staging_file` in its `finally`, which also calls `save(update_fields=["staging_file", "updated_at"])`. After both run, you have two writers that may overwrite later state changes (e.g. `status="review_required"` set in `_analyze_governance` could be clobbered if `update_fields` changes order with auto_now). Centralize cleanup.

### 🟠 HIGH — `run_ingest_job` `else` branch resets status to `running` while retries happen
```292:296:backend/ingest/tasks.py
else:
    job.status = "running"
    job.ingest_stage = "extracting"
    job.ingest_stage_detail = "Retrying ingest job"
```
But `autoretry_for=(Exception,)` re-raises and Celery retries the task. The next attempt enters the `try` block and overwrites `status="running"`. Mostly cosmetic, but a UI watching `ingest_stage` will flap between `extracting` and `failed` confusingly. Also, `chunk_count`, `wiki_page` are cleared by `_materialize_and_index` but only written if the pipeline reaches that branch; a partial run leaves the fields stale.

### 🟡 MEDIUM — `run_pipeline.run_pipeline` can leave Wiki page partially indexed
If `_persist_chunks` succeeds but `vector_store.upsert_chunks` raises, the DB has new chunks but Qdrant doesn't. Subsequent reindexes won't fix it (because they overwrite both). Wrap in a transaction and only commit the DB after Qdrant returns.

### 🟡 MEDIUM — `_derive_title` uses `urlparse(...).path.strip("/")` for `repo` source — empty path (root repo URL) becomes `"Repo: "` then truncated. Fall back to the host or repo name.

### 🟡 MEDIUM — `run_ingest_job` `record_first_once` race
`done_count == 1` check after marking the job done isn't atomic. Two concurrent first ingests could both fire `first_ingest_completed`. Use `record_first_once`'s own deduplication if it actually enforces uniqueness; otherwise wrap in transaction with `select_for_update`.

### 🟡 MEDIUM — `run_gap_analysis` loads every page into memory and concatenates content; OK at 1k pages, breaks at 100k.

---

## 7. Wiki / Planning / Graph

### 🟠 HIGH — `unique_slug` race
```28:40:backend/wiki/views.py
def unique_slug(team, title, exclude_id=None):
    base = slugify(title) or "page"
    slug = base
    n = 1
    qs = WikiPage.objects.filter(team=team, slug=slug)
    ...
```
Concurrent creates from agent + UI can both find no clash, then both insert and one will hit the `unique_together("team", "slug")` constraint → 500 to the user. Either retry on `IntegrityError` with `n+=1`, or use a DB advisory lock per team.

### 🟠 HIGH — `WikiPageDetailView.delete` only soft-deletes the page, but cascades graph hard-deletes
```151:156:backend/wiki/views.py
page.is_deleted = True
page.save()
from graph_engine.models import GraphEdge
GraphEdge.objects.filter(from_page=page).delete()
GraphEdge.objects.filter(to_page=page).delete()
```
Recovering a page later requires re-running ingest for graph wiring, and there is no UI for "trash → restore". Either fully soft-delete (move edges to a soft state) or fully hard-delete with confirmation.

### 🟠 HIGH — `WikiPageListView.get` uses `CanEditWiki` (allows all SAFE_METHODS for members), but the queryset isn't team-scoped through membership
The view uses `team_id=team_id` from the URL, which is fine, but there's no defense-in-depth check that the user actually belongs to that team because `CanEditWiki` short-circuits `True` when `team_id` cannot be resolved (see HIGH above).

### 🟡 MEDIUM — `WikiBacklinksView` regex builds a per-edge regex from `page.title`
```176:178:backend/wiki/views.py
pattern = re.compile(r".{0,80}\[\[" + re.escape(page.title) + r"\]\].{0,80}", re.IGNORECASE)
match = pattern.search(fp.content)
```
For 1 000 backlinks each searching a 100 KB page, that's slow and synchronous. Pre-compile, batch.

### 🟡 MEDIUM — `WikiUnlinkedMentionsView` uses `content__icontains=page.title` and excludes `[[page.title]]` literal — but matches partial titles ("Plan" matches "Planning"). False positives.

### 🟡 MEDIUM — `GraphEdgeCreateView` accepts arbitrary `edge_type`
No whitelist; saves whatever the client sends. CHOICES is not enforced at DB level.

### 🟡 MEDIUM — `compute_team_graph_analytics` is O(n*iters + n + e) and runs on a request thread when cache misses. A team with 50 000 pages will time out the request. Move to Celery + warm cache + return the cached snapshot.

### 🟡 MEDIUM — `planning.services.create_project` always creates a wiki page from the project. Missing transaction — if the wiki create fails (slug clash, etc.), the project remains without its dashboard, and user sees a 500 with the project actually persisted. Wrap both in `transaction.atomic()`.

### 🟡 MEDIUM — `generate_plan_draft` returns raw LLM JSON to clients with no schema validation
```234:246:backend/planning/services.py
response = llm.chat.completions.create(
    model=model,
    messages=messages,
    response_format={"type": "json_object"},
)
import json
return json.loads(response.choices[0].message.content)
```
No size limit, no schema enforcement. A pathological model output (1 MB JSON, recursive structure) is sent to the client. Wrap with size/shape guards.

---

## 8. Presence

### 🟠 HIGH — Race on cache read-modify-write
```14:21:backend/presence/presence_state.py
current = cache.get(key) or {}
current[user_email] = {...}
cache.set(key, current, cls.TTL)
```
Two simultaneous joins or leaves can clobber each other. Use Redis HSET / atomic operations directly (`django_redis`'s `client.hset`) or per-user keys.

### 🟡 MEDIUM — TTL only refreshed on explicit `update_presence` calls; long-idle users vanish in 60 s while still WebSocket-connected. Add a heartbeat or refresh on every received frame.

### 🟡 MEDIUM — `consumers.PresenceConsumer.receive` does `json.loads(text_data)` with no try/except; a malformed frame raises and disconnects the socket.

---

## 9. Logging / Observability

### 🟡 MEDIUM — `StructuredLogger._log` will crash on non-JSON-serializable kwargs
```13:21:backend/teamos_project/logging_utils.py
log_data = {
    "timestamp": time.time(),
    "level": level,
    ...
    "context": kwargs
}
self.logger.log(getattr(logging, level.upper()), json.dumps(log_data))
```
Any caller passing a `datetime`, `UUID`, `Decimal`, model instance, etc. as a kwarg raises inside the logger and the wrapping task fails. Use `json.dumps(..., default=str)`.

### 🟡 MEDIUM — `trace_id` appears twice (top-level and `context`). Use one or the other.

### 🟡 MEDIUM — `fail(... details=...)` callers occasionally pass exception strings, leaking internals to clients. Centrally redact.

### 🟡 MEDIUM — No DRF exception handler set; uncaught DRF errors return DRF's default `{"detail": "..."}` shape, but most endpoints return `{"success": True/False, ...}`. The frontend will get inconsistent shapes on 401/500. Add `EXCEPTION_HANDLER`.

### 🟡 MEDIUM — `record_dead_letter` writes the entire `payload` (including arbitrary user-supplied content) to the DB and to `ops_logger.error`. Truncate.

---

## 10. Misc / Sundries

### 🟡 MEDIUM — Soft-deleted teams aren't filtered in many places
`accounts.team_access.get_team_membership` filters `team__is_deleted=False`. But e.g.:
- `chat/views.py:ChatSessionListView.get` filters `team_id=team_id` — works fine via `IsTeamMember`.
- `billing/views.py:CreateCheckoutSessionView` filters by `team_id=team_id, user=request.user` directly without `is_deleted=False`. Owner of a soft-deleted team can still create a checkout session for it.
- `ingest/views.py` does `Team.objects.get(id=team_id)` without `is_deleted=False`.

### 🟡 MEDIUM — `purge_soft_deleted_team` uses `apply_async(countdown=...)` that depends on broker durability
A 24 h delay scheduled in Redis: if Redis is restarted/migrated within the grace window, the purge is silently lost. Better: a periodic Beat job that scans `Team.objects.filter(is_deleted=True, purge_after__lte=now)`.

### 🟡 MEDIUM — `record_first_once` (referenced from many places) is in `product_analytics.services` but the file isn't shown above; ensure it has its own concurrency guard (likely a unique index on `(team, event_name)`).

### 🟡 MEDIUM — `IngestJob.save(update_fields=["staging_file", ...])` is called from both worker and pipeline; they don't include `error` consistently → `error` text drift.

### 🟡 MEDIUM — `WikiSearchView` and `WikiRecentView` are listed as `IsTeamMember` but don't paginate and `WikiPage.objects.filter(...)` for big teams returns thousands of rows → slow SPA.

### 🟡 MEDIUM — Static / WhiteNoise configured in middleware but `STATIC_ROOT` isn't set anywhere; `collectstatic` will fail or place files outside the served path. Set `STATIC_ROOT = BASE_DIR / "staticfiles"`.

### 🟡 MEDIUM — Production `SECURE_SSL_REDIRECT = True` without `SECURE_PROXY_SSL_HEADER` will infinite-redirect behind any TLS-terminating proxy (Vercel, Fly, ELB).

### 🟡 MEDIUM — `SIMPLE_JWT["ROTATE_REFRESH_TOKENS"] = True` but no blacklist app installed → rotated refresh tokens stay valid until expiry.

### 🟡 MEDIUM — `SECURE_BROWSER_XSS_FILTER = True` is no-op in modern Django/browsers (XSS auditor was removed) — replace with strong CSP.

### 🟢 LOW — `accounts/views.py:set_jwt_cookies` issues both refresh and access tokens, but `LogoutView` only deletes cookies — no blacklist call. Stolen refresh remains usable.

### 🟢 LOW — `OPENAI_TTS_MODEL = "tts-1"` is deprecated; switch to `gpt-4o-mini-tts`.

### 🟢 LOW — `ACCOUNT_EMAIL_VERIFICATION = "none"` allows arbitrary email at signup; combined with the invite flow that matches by email, an attacker can claim someone else's invite by signing up with the invitee's email. Either require email verification or compare invites against a verified email field.

### 🟢 LOW — `accounts.tasks.purge_soft_deleted_team` has `max_retries=0` and uses `from accounts.models import Team` lazy-imports; fine, but the early returns silently skip — log them.

### 🟢 LOW — `ExportWikiView` builds the entire ZIP in memory and naively serializes YAML frontmatter with manual string concatenation — values containing `:`, `\n`, or `#` will produce invalid YAML on round-trip. Use `yaml.safe_dump`.

### 🟢 LOW — `chat/views.py:ChatSessionDetailView.delete` returns 404 silently if not the owner of the session; should explicitly distinguish forbidden vs not-found for ops.

### 🟢 LOW — `chat/agent_stream.py` requires `LLM_BACKEND=openai` for tool agent mode but the deny error message says "switch backend" — misleading because the user can't switch backend; that's a server admin concern.

### 🟢 LOW — `chat/views.py:_build_ask_system_prompt` references mermaid charts that the frontend may not render; doc-only issue.

---

# Severity Roll-up

| Severity | Theme |
|----------|-------|
| **CRITICAL** | Missing `qdrant-client` dep · Legacy `settings.py` still authoritative for WSGI · Presence WebSocket has no membership/JWT auth (and is broken for Clerk users) · Clerk fallback issuer accepts any Clerk tenant · Clerk `get_or_create` IntegrityError on existing emails · Stripe webhook signature verification is wrong · Wiki re-index leaks Qdrant points indefinitely |
| **HIGH** | Compose & Procfile load dev settings in prod · Production `SECRET_KEY`/`ALLOWED_HOSTS` unguarded · Dockerfile root + no healthcheck · `IsTeamMember` returns True with missing team_id · Mass-assignment in planning services bypasses `TaskWriteSerializer` · Cross-team task dependencies and project members · Paddle/Stripe webhooks trust payload `team_id`/`plan_key` · Webhook re-processing races · No Celery Beat in Procfile · Streaming chat blocks Daphne event loop · Token / ingest / export quotas are lifetime · TokenUsage only persists on success · SSRF redirects + git clone without `--` · Decompression bomb risk in code zip · Eager `vector_store = VectorStore()` at import · Embedding silent fallback to deterministic |
| **MEDIUM** | Long-lived JWT cookies + no blacklist · Soft-deleted teams reachable via billing/ingest · `unique_slug` race · WikiPagePublishView synchronous pipeline · `compute_team_graph_analytics` blocking · Race on presence cache · Presence TTL drift · Logger crashes on non-JSON kwargs · Missing DRF throttling · Missing `STATIC_ROOT` · Missing `SECURE_PROXY_SSL_HEADER` · Pricing rounding uses `int`/`float` mix · Paddle live transaction misses `customer_id` · `_chat_json_completion` swallows errors · `update_task` order-of-operations on retries · `WikiPageDetailView.delete` mismatch (soft page / hard edges) · `_derive_title` repo edge cases · Wiki backlinks regex per-edge · CI uses Python 3.11 vs runtime 3.12 · `django-channels==0.7.0` dependency suspect · Plan tier `"anthropic"` never used · `payload.chunk_id` missing for wiki citations · Demo script imports legacy settings · `fail(..., details=...)` may leak internals |
| **LOW** | LogoutView no blacklist call · Deprecated `tts-1` model · `ACCOUNT_EMAIL_VERIFICATION = "none"` · Manual YAML dump · Dead `qdrant_point_id` field · Misleading error messages · Presence consumer crashes on bad JSON |

---

# Top 10 things I would fix before any production traffic

1. Add `qdrant-client` to `requirements.txt` and stop using a module-level `vector_store = VectorStore()`.
2. Delete (or shrink) the legacy `backend/teamos_project/settings.py` and force every entrypoint to require `DJANGO_SETTINGS_MODULE`. Add `SECRET_KEY` / `ALLOWED_HOSTS` fail-fast asserts.
3. Replace the home-grown Stripe signature check with `stripe.Webhook.construct_event` (and re-verify Paddle handling against signed `team_id`).
4. Lock down `_derive_issuer_and_jwks_from_token` to `settings.DEBUG only`; refuse missing Clerk env in prod.
5. Wire Clerk JWT auth into the Channels middleware stack and add membership check in `PresenceConsumer.connect`.
6. Make `IsTeamMember`/`CanEditWiki`/`CanEditPlans` return `False` when `team_id` cannot be resolved.
7. Fix `wiki/services/reindex.py` to delete previous Qdrant points before re-upserting (and stop silent embedding fallback in production).
8. Convert `WikiPagePublishView` and ingest re-runs to async Celery tasks; offload chat streaming/agent ORM writes off the request thread.
9. Make plan/task/milestone updates go through serializers (no `setattr` on raw dicts) and validate `assignee_id`/`dependency_ids`/`members[].user_id` belong to the same team.
10. Switch quota counters to a rolling 30-day window so users aren't permanently capped after a single burst.

If you want, I can turn this into a per-file remediation checklist or open targeted PRs for any of the CRITICAL items.
