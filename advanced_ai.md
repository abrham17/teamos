# TeamOS — Advanced AI & Automation Module

The Advanced AI module provides the "intelligence" that keeps the TeamOS wiki autonomous, structured, and proactive. It moves beyond simple search to actively manage and improve your team's knowledge.

---

## 1. Automated Template Matching

TeamOS eliminates the friction of manual categorization. Every document ingested into the system is analyzed by the **AI Template Engine**:
*   **Automatic Categorization**: The system detects if a document is a "Meeting Note," "Decision Record," "Project Brief," or "SOP."
*   **Structured Metadata**: Based on the detected type, the system applies the relevant `page_type` and frontmatter templates automatically.
*   **Consistent Formatting**: This ensures that even when ingesting messy raw data (like a Slack thread or a rough markdown file), it is presented in the wiki with a consistent, professional structure.

---

## 2. AI Gap Analysis (Orphan Detection)

A static wiki eventually develops "knowledge holes." TeamOS proactively identifies these gaps using **Graph-based Gap Analysis**:
*   **Orphan Concepts**: The system scans all wiki pages for `[[wikilinks]]` that point to pages that do not yet exist.
*   **Frequency Priority**: It identifies concepts that are mentioned multiple times across different documents but lack a dedicated definition or page.
*   **Proactive Suggestions**: The system flags these "Orphaned Concepts" in the admin dashboard, suggesting that a new page be created or synthesized from existing snippets.

---

## 3. Multi-Modal Awareness (Beta)

TeamOS is designed to grow beyond text:
*   **Visual Ingestion**: Future support for PDF diagrams and whiteboard photos, converting visual concepts into structured graph nodes.
*   **Vision-to-Wiki**: Using multi-modal LLMs to describe architecture diagrams and insert the description directly into the relevant wiki section.

---

## 4. Technical Implementation

*   **Logic**: `_detect_template_and_type` in [pipeline.py](file:///home/abrhame/projects/mem2/teamos/backend/ingest/pipeline.py).
*   **Background Task**: `run_gap_analysis` in [tasks.py](file:///home/abrhame/projects/mem2/teamos/backend/ingest/tasks.py).
*   **Categorization**: Powered by **GPT-4o** with structured JSON output.

### Code Reference
*   [Ingestion Pipeline](file:///home/abrhame/projects/mem2/teamos/backend/ingest/pipeline.py) — The template detection orchestrator.
*   [AI Tasks](file:///home/abrhame/projects/mem2/teamos/backend/ingest/tasks.py) — The Gap Analysis engine.
