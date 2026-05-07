# TeamOS Agent-Centric Transformation Plan

> **Goal**: Make the AI agent the central nervous system of TeamOS — every operation flows through or triggers the agent.

---

## Current State — Honest Assessment

### Problem 1: Ingested documents are NOT real wikis
- A PDF/URL/DOCX becomes **one flat WikiPage** with raw text dumped in
- `PageChunk` rows are word-count splits for vector search, not semantic sections
- No AI decomposition into multiple interconnected articles
- `[[wikilinks]]` only work if raw source already contains them (never true for PDFs/YouTube)

### Problem 2: Agent barely uses the wiki
- Agent does a **5-chunk vector lookup** before planning — may miss critical pages
- `wiki_search_pages` tool uses `icontains` string matching, not vector search
- Agent never traverses graph relationships
- Agent never resolves contradictions during planning
- Plans are mostly LLM imagination with thin RAG veneer

### Problem 3: Graph is a similarity graph, not a knowledge graph
- Only meaningful edges: `wikilink` (rarely exists) and `semantic` (cosine similarity)
- No typed relations: can't answer "what contradicts this?" or "what depends on this?"
- `citation` edge type defined but never created anywhere
- PageRank/clustering computed but relationships are meaningless

### Problem 4: Agent is a chat sidecar, not the brain
- 90% of operations bypass the agent (direct REST → DB)
- Agent has no awareness of wiki/plan changes happening outside chat
- No persistent agent memory across sessions

---

## Transformation Architecture

```
CURRENT:  User → REST API → Database  (agent is blind)
          User → Chat → Agent → Tools → Database

TARGET:   User → REST API → Database → Agent Reacts (async)
          User → Chat → Agent → Operations → Database
          Agent autonomously: links, validates, suggests, syncs
```

---

## Core Concept 1: Agent-Driven Ingestion with Real Wiki Decomposition

### What must happen when a new raw material is added:

```
Raw Document (PDF, URL, DOCX, YouTube, etc.)
    │
    ▼
1. EXTRACT — Pull raw text (existing extractors work fine)
    │
    ▼
2. SAVE RAW SOURCE — Store the original file/URL permanently (see Concept 2)
    │
    ▼
3. 🤖 AGENT DECOMPOSE — The agent reads the full text and:
    a) Identifies distinct topics, sections, entities
    b) Decides how many wiki pages to create
    c) Generates each page with proper markdown
    d) Injects [[wikilinks]] between the new pages
    │
    ▼
4. 🤖 AGENT RELATE — For EACH new page, the agent:
    a) Searches existing wiki (vector + graph traversal)
    b) Identifies related existing pages
    c) Creates TYPED edges (depends_on, extends, contradicts, etc.)
    d) Injects [[wikilinks]] INTO existing pages where relevant
    e) Detects contradictions with existing content
    │
    ▼
5. CONTRADICTION HANDLING (if auto_approve=False):
    a) Present contradictions to user in GitHub conflict resolution style
    b) Show side-by-side: existing content vs. new content
    c) User picks: keep existing | accept new | merge manually
    d) Only after resolution: pages are published
    │
    ▼
6. PUBLISH — Create/update WikiPages, chunk, embed, wire graph
```

### Contradiction Resolution (GitHub-Style)

When contradictions are detected and `auto_approve=False`:

```
┌─────────────────────────────────────────────────────┐
│  ⚠️  Contradiction Detected                         │
│                                                      │
│  Existing: [[API Security Policy]]                   │
│  ───────────────────────────                         │
│  "All API endpoints must use OAuth 2.0              │
│   with JWT tokens for authentication."              │
│                                                      │
│  New Content: (from uploaded-security-review.pdf)    │
│  ───────────────────────────                         │
│  "Internal APIs should use API key                  │
│   authentication for simplicity."                   │
│                                                      │
│  [Keep Existing] [Accept New] [Edit & Merge]        │
└─────────────────────────────────────────────────────┘
```

### Implementation — New module: `ingest/agent_decompose.py`

```python
# Pseudo-code for the agent decomposition pipeline

def agent_decompose_document(job: IngestJob, raw_text: str, trace_id: str):
    """
    The agent reads the full document and decides how to split it
    into multiple interlinked wiki pages.
    """
    
    # Step 1: Ask agent to identify topics and structure
    decomposition = llm_call(
        system="You are the TeamOS Knowledge Architect. Analyze this document "
               "and decompose it into distinct wiki pages. For each page provide: "
               "title, content (markdown), page_type, and links to other pages "
               "you're creating. Return JSON.",
        user=raw_text
    )
    # Result: [{ title, content, page_type, internal_links: [title, ...] }]
    
    # Step 2: For each proposed page, search for existing related pages
    for proposed_page in decomposition["pages"]:
        existing_related = vector_store.search_similar_pages(
            team_id, proposed_page["content"], limit=10
        )
        
        # Step 3: Agent evaluates relations
        relations = llm_call(
            system="Compare this new wiki page with existing pages. "
                   "For each existing page, classify the relationship: "
                   "extends | contradicts | depends_on | supersedes | "
                   "prerequisite | unrelated. "
                   "Return JSON with contradictions highlighted.",
            user=f"NEW PAGE:\n{proposed_page}\n\nEXISTING PAGES:\n{existing_related}"
        )
        
        # Step 4: If contradictions found and not auto_approve
        if relations["contradictions"] and not job.auto_approve:
            create_contradiction_changeset(job, proposed_page, relations)
            # User must resolve before publish
            return "review_required"
        
        # Step 5: Create typed graph edges
        for rel in relations["relations"]:
            GraphEdge.objects.create(
                from_page=new_page,
                to_page=rel["existing_page"],
                edge_type=rel["type"],  # "depends_on", "extends", etc.
                confidence=rel["confidence"],
                metadata={"reason": rel["reason"]},
                created_by="agent"
            )
        
        # Step 6: Inject [[wikilinks]] into existing pages
        for existing_page in relations["should_link_from"]:
            inject_wikilink(existing_page, new_page.title)
```

### GraphEdge model expansion needed:

```python
EDGE_TYPE_CHOICES = [
    ("wikilink", "Wikilink"),
    ("semantic", "Semantic Similarity"),
    ("depends_on", "Depends On"),
    ("contradicts", "Contradicts"),
    ("extends", "Extends"),
    ("implements", "Implements"),
    ("supersedes", "Supersedes"),
    ("parent_child", "Parent-Child"),
    ("prerequisite", "Prerequisite"),
    ("references", "References"),
]

# Add metadata field for relationship reasoning
metadata = models.JSONField(default=dict, blank=True)
# e.g., {"reason": "Both discuss API auth but recommend different approaches"}
```

---

## Core Concept 2: Raw Source Preservation with Exact-Position Linking

### Every wiki page must link back to its raw source

When a wiki page is created from a raw source (PDF, URL, DOCX, YouTube), BOTH must be saved, and the wiki must provide clickable links back to the exact position in the raw source.

### New Model: `RawSource`

```python
class RawSource(models.Model):
    """Permanent storage of original ingested material."""
    
    SOURCE_TYPE_CHOICES = [
        ("pdf", "PDF"),
        ("docx", "DOCX"),
        ("url", "URL"),
        ("youtube", "YouTube"),
        ("markdown", "Markdown"),
        ("image", "Image"),
        ("repo", "Repository"),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="raw_sources")
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES)
    
    # The original file (S3/media storage) — NEVER deleted
    file = models.FileField(upload_to="raw_sources/%Y/%m/", null=True, blank=True)
    original_filename = models.CharField(max_length=500, blank=True)
    
    # For URL/YouTube sources
    source_url = models.URLField(blank=True)
    
    # Full extracted text with position markers
    extracted_text = models.TextField()
    
    # Metadata: page numbers, timestamps, section headers
    structure_map = models.JSONField(default=dict)
    # Example for PDF: {"pages": [{"number": 1, "char_start": 0, "char_end": 2340}, ...]}
    # Example for YouTube: {"segments": [{"timestamp": "00:02:15", "char_start": 0, "char_end": 500}, ...]}
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

### New Model: `WikiSourceCitation`

```python
class WikiSourceCitation(models.Model):
    """Maps a specific section of a wiki page back to a specific position in a raw source."""
    
    wiki_page = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="source_citations")
    raw_source = models.ForeignKey(RawSource, on_delete=models.CASCADE, related_name="citations")
    
    # Position in the wiki page
    wiki_char_start = models.IntegerField()
    wiki_char_end = models.IntegerField()
    wiki_section = models.CharField(max_length=300, blank=True)
    
    # Position in the raw source
    source_char_start = models.IntegerField()
    source_char_end = models.IntegerField()
    source_page_number = models.IntegerField(null=True)  # For PDFs
    source_timestamp = models.CharField(max_length=20, blank=True)  # For YouTube "HH:MM:SS"
    source_section = models.CharField(max_length=300, blank=True)
```

### How it works in the UI:

```
Wiki Page: "API Authentication Guide"
──────────────────────────────────────
Content:
  "All endpoints must use OAuth 2.0..." [📄 Source: security-review.pdf, p.12]
  
  "Rate limiting is set to 100 req/min..." [📄 Source: api-specs.docx, §3.2]
  
  "See the demo at timestamp 2:15..." [🎬 Source: onboarding-video, 02:15]

Clicking [📄 Source: security-review.pdf, p.12]:
  → Opens a modal/panel showing the raw PDF scrolled to page 12
  → Highlights the exact paragraph that was used

Clicking [🎬 Source: onboarding-video, 02:15]:
  → Opens YouTube embed at 2:15 timestamp
```

### Frontend component needed:

```
WikiPage detail view:
  ├── Main content (markdown rendered)
  ├── Source Citations sidebar (list of raw sources)
  │   ├── 📄 security-review.pdf (click to open)
  │   ├── 📄 api-specs.docx (click to open)
  │   └── 🎬 onboarding-video (click to play)
  └── Raw Source Viewer (modal/drawer)
      ├── PDF viewer with page navigation
      ├── Document viewer for DOCX
      └── YouTube embed with timestamp
```

### Pipeline changes:

During ingestion, the agent must track WHERE each piece of wiki content came from:

```python
def agent_decompose_with_citations(raw_text: str, source: RawSource):
    """
    Agent decomposes AND tracks source positions.
    """
    decomposition = llm_call(
        system="Decompose this document into wiki pages. "
               "For EACH paragraph/section you generate, include the "
               "character range from the original text that it came from. "
               "Format: { pages: [{ title, content, citations: [{ "
               "wiki_section, source_char_start, source_char_end }] }] }"
    )
    
    for page_data in decomposition["pages"]:
        page = WikiPage.objects.create(...)
        
        for citation in page_data["citations"]:
            WikiSourceCitation.objects.create(
                wiki_page=page,
                raw_source=source,
                source_char_start=citation["source_char_start"],
                source_char_end=citation["source_char_end"],
                source_page_number=source.structure_map.get("page_at", {}).get(
                    citation["source_char_start"]
                ),
                # ... etc
            )
```

---

## Core Concept 3: Real Relational Knowledge Graph

### The graph must capture REAL semantic relations, not just similarity scores.

### Current vs. Target:

```
CURRENT GRAPH:
  Page A --[semantic, 0.78]--> Page B    (meaningless: "texts are similar")
  Page C --[wikilink]--> Page A          (only if user manually wrote [[A]])

TARGET GRAPH:
  "API Security Policy" --[supersedes]--> "API Security v1"
  "API Security Policy" --[implements]--> "SOC 2 Compliance"
  "API Security Policy" --[contradicts]--> "Quick Deploy Playbook"
  "Sprint 14 Plan" --[references]--> "API Security Policy"
  "Onboarding Guide" --[prerequisite]--> "Day 1 Checklist"
  "Day 1 Checklist" --[parent_child]--> "IT Setup Procedure"
```

### How the agent builds real relations:

**On every page create/update, the agent must:**

1. **Read the new/updated page content fully**
2. **Vector search** for the top 15 related pages
3. **Read the content** of those 15 pages
4. **Classify each relationship** using LLM:
   ```
   For each pair (new_page, existing_page):
     - "extends" → new page adds to existing topic
     - "contradicts" → new page says something different
     - "supersedes" → new page replaces old information
     - "depends_on" → new page requires existing page's knowledge
     - "prerequisite" → existing page must be read first
     - "implements" → new page is a practical implementation of existing spec
     - "references" → simple mention/citation
     - "parent_child" → hierarchical topic relationship
     - "unrelated" → similarity was spurious, no edge
   ```
5. **Create typed edges** with a `reason` field explaining WHY
6. **Inject [[wikilinks]]** into both pages where natural
7. **Update the wiki page** with a "Related Pages" section at the bottom

### Graph query tools for the agent:

```python
# The agent needs these tools to traverse the graph intelligently:

"graph_traverse" — Get connected pages within N hops, filtered by relation type
"graph_find_contradictions" — Find all pages that contradict given content
"graph_find_prerequisites" — What must be read/done before this?
"graph_find_dependents" — What breaks if this page changes?
"graph_find_gaps" — Topics mentioned but not documented
"graph_get_page_context" — Full neighborhood: all relations + their content summaries
```

### Graph analytics improvements:

```python
# Beyond PageRank and clustering, compute:

- Contradiction clusters: groups of pages that disagree
- Staleness score: pages with many "supersedes" edges pointing TO them
- Coverage score: how well the wiki covers a topic area
- Dependency chains: critical paths through the knowledge graph
- Impact analysis: "if this page changes, what else is affected?"
```

---

## Core Concept 4: Agent-Driven Project Planning with Full Lifecycle Management

### The agent must manage EVERYTHING in the planning domain:

```
When a project is created or updated, the agent must:
  1. Update the project's wiki page with current status
  2. Update the calendar with all task/milestone dates
  3. Detect schedule conflicts
  4. Suggest task assignments based on team member expertise
  5. Flag blocked tasks and suggest unblocking actions
  6. Sync wiki knowledge changes to affected plan items
  7. Generate status reports
```

### Agent Planning Flow — Full Lifecycle:

```
USER: "Plan the Q3 API migration"
    │
    ▼
🤖 AGENT PHASE 1: Knowledge Gathering
    ├── Vector search wiki for "API migration"
    ├── Traverse graph: find [[API Architecture]] → [[Migration Playbook]] → [[SLA Requirements]]
    ├── Read FULL content of all related pages (not just chunks)
    ├── Identify knowledge gaps: "No wiki page for 'Target API Schema'"
    └── Check for contradictions in existing knowledge

🤖 AGENT PHASE 2: Plan Generation (wiki-grounded)
    ├── Generate tasks WITH references to wiki pages
    │   e.g., Task: "Define target schema" → references [[API Architecture]]
    ├── Generate milestones aligned with wiki SOPs
    ├── Set dates on calendar
    ├── Suggest assignees based on past wiki contributions
    └── Identify risks from contradiction graph

🤖 AGENT PHASE 3: Wiki Sync
    ├── Create wiki page: "Q3 API Migration Plan" (project brief)
    ├── Create wiki stubs for knowledge gaps: "Target API Schema"
    ├── Wire graph: Plan wiki page → all referenced pages
    ├── Update [[API Architecture]] with link to new plan
    └── Add "Related Projects" section to existing wiki pages

🤖 AGENT PHASE 4: Ongoing Management (triggered by changes)
    ├── Task completed → agent updates wiki page status
    ├── Wiki page changed → agent checks if plan tasks are affected
    ├── Milestone date passed → agent flags missed milestone
    ├── New knowledge ingested → agent checks relevance to active plans
    ├── Calendar conflict detected → agent suggests rescheduling
    └── Weekly: agent generates status summary
```

### Calendar Management:

```python
# Agent tools for calendar management:

"calendar_get_events" — Get all events for a date range
"calendar_detect_conflicts" — Find overlapping tasks/milestones
"calendar_suggest_reschedule" — AI-powered rescheduling when conflicts detected
"calendar_sync_from_plan" — Push all plan dates to calendar
"calendar_generate_timeline" — Create a visual timeline markdown

# Example agent behavior:
# When a task's end_date is updated:
@shared_task
def agent_calendar_sync(task_id: str):
    task = Task.objects.get(id=task_id)
    
    # Check for conflicts
    conflicts = detect_date_conflicts(task)
    if conflicts:
        # Agent suggests resolution
        notify_team("Calendar conflict detected: Task '{task.title}' "
                    "overlaps with '{conflict.title}'. Suggesting reschedule.")
    
    # Update project wiki page with new timeline
    project_wiki = task.project.wiki_page
    if project_wiki:
        updated_timeline = generate_timeline_markdown(task.project)
        # Agent updates the wiki page's timeline section
        agent_update_wiki_section(project_wiki, "## Timeline", updated_timeline)
```

### Task ↔ Wiki Bidirectional Sync:

```python
# When a wiki page is updated that's referenced by plan tasks:
@shared_task  
def agent_plan_wiki_sync(page_id: str):
    page = WikiPage.objects.get(id=page_id)
    
    # Find all plan tasks that reference this page via graph
    edges = GraphEdge.objects.filter(
        to_page=page, 
        from_page__project__isnull=False
    )
    
    for edge in edges:
        project = edge.from_page.project
        if project:
            # Agent evaluates impact
            impact = llm_call(
                "This wiki page changed. Does it affect these plan tasks? "
                "If yes, suggest task updates.",
                context={"wiki_change": page.content, "tasks": project.tasks.all()}
            )
            
            if impact["affected_tasks"]:
                for task_update in impact["affected_tasks"]:
                    # Auto-update or flag for review
                    pass
```

---

## Implementation Status (All Phases Complete ✅)

| Phase | What | Status | Implementation |
|-------|------|--------|----------------|
| **1** | Agent Decomposition Pipeline | ✅ Done | `ingest/agent_decompose.py` — 447 lines, full decompose → relate → create flow |
| **2** | Raw Source Preservation | ✅ Done | `ingest/models.py` → `RawSource`, `WikiSourceCitation`; `pipeline.py` → `_save_raw_source()` |
| **3** | Typed Graph Relations | ✅ Done | `graph_engine/models.py` — 10 edge types + metadata + reason + created_by |
| **4** | Contradiction Resolution UI | ✅ Done | `ingest/contradiction_resolver.py` + `frontend/…/ConflictResolver.tsx` (523 lines) |
| **5** | Agent Graph Traversal Tools | ✅ Done | `graph_engine/traversal.py` — 6 functions; all exposed in `chat/tools.py` |
| **6** | Agent Planning Lifecycle | ✅ Done | `planning/agent_sync.py` — 400 lines: conflicts, impact, sync, wiki-grounded planning |
| **7** | Agent Reaction Hooks | ✅ Done | `ingest/tasks.py` → `agent_sync_wiki_to_plans`; pipeline routes through agent decomposer |
| **8** | Agent Persistent Memory | ✅ Done | `chat/models.py` → `AgentMemory`; `chat/agent_memory_service.py` + tools in `chat/tools.py` |

---

## Key Principle

> **The agent is not a chatbot that sometimes edits wiki pages. The agent IS the knowledge engine — it decomposes, relates, validates, plans, and synchronizes ALL team knowledge. Every piece of information that enters the system passes through the agent's understanding.**

---

## Files Created/Modified (Reference)

### Created Files:
- ✅ `backend/ingest/agent_decompose.py` — Agent-driven document decomposition (447 lines)
- ✅ `backend/ingest/contradiction_resolver.py` — GitHub-style conflict detection (161 lines)
- ✅ `backend/ingest/models.py` — `RawSource`, `WikiSourceCitation` models (213 lines)
- ✅ `backend/graph_engine/traversal.py` — Graph query utilities for agent (277 lines)
- ✅ `backend/planning/agent_sync.py` — Bidirectional plan↔wiki sync (400 lines)
- ✅ `backend/chat/agent_memory_service.py` — Persistent agent memory (87 lines)
- ✅ `frontend/src/components/wiki/RawSourceViewer.tsx` — Raw source viewer (419 lines)
- ✅ `frontend/src/components/wiki/ConflictResolver.tsx` — Contradiction UI (523 lines)

### Modified Files:
- ✅ `backend/graph_engine/models.py` — 10 typed edge types, metadata, reason fields
- ✅ `backend/ingest/pipeline.py` — Routes through agent decomposer with legacy fallback
- ✅ `backend/ingest/tasks.py` — Agent reaction tasks (`agent_sync_wiki_to_plans`)
- ✅ `backend/chat/tools.py` — 15 agent tools (graph traversal, calendar, memory, wiki, planning)
- ✅ `backend/chat/agent_stream.py` — Full agent system prompts with memory injection
- ✅ `backend/wiki/views.py` — `RawSourceListView`, `RawSourceDetailView`
- ✅ `backend/wiki/serializers.py` — Citations included in wiki page responses
- ✅ `backend/wiki/urls.py` — Raw source routes wired
