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
