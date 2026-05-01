# TeamOS — Citational Chat System

The Team Chat System is the interactive interface for querying the Knowledge Base. It uses Retrieval-Augmented Generation (RAG) to provide grounded, accurate answers backed by the team's wiki and raw source data.

---

## 1. High-Performance RAG Pipeline

The chat system implements a sophisticated multi-stage pipeline for every query:

### Stage 1: Semantic Retrieval
*   **Vector Search**: The user's query is embedded and searched against the team's **Qdrant** collection.
*   **Ranked Results**: The top-k most relevant chunks are retrieved, providing the "Evidence Base" for the AI.

### Stage 2: Citational Grounding
*   **Evidence Chips**: Before the AI begins writing, the system streams **Citations** to the frontend.
*   **Actionable Links**: Every citation includes the `page_id` and `slug`. Clicking a citation chip in the chat window will automatically:
    1.  Navigate the user to the Wiki page.
    2.  Highlight the relevant section.
    3.  Open the **Markdown Editor** for that page.

### Stage 3: Streaming Generation
*   **Real-time Tokens**: The response is streamed token-by-token via **Server-Sent Events (SSE)**, ensuring zero perceived latency.
*   **Source Integrity**: The AI is instructed to answer based *only* on the provided wiki context, minimizing hallucinations.

---

## 2. Actionable Features

### Interactive Citations
The chat is not a "read-only" window. It serves as a navigational hub:
*   **Direct-to-Editor**: Citations are deep-linked to the TipTap editor.
*   **Exact Source Grounding**: If the info came from a raw PDF, the citation can link back to the exact paragraph in the original source.

### Agentic "File-back" Operations (Beta)
The system is designed to allow the AI to propose changes to the wiki:
*   *"I found a contradiction between Document A and Document B. Should I update the 'Project Roadmap'?"*
*   Users can approve these proposals with one click, triggering an autonomous update to the wiki.

---

## 3. Technical Implementation

*   **API**: `POST /api/chat/:team_id/sessions/:session_id/query/` (SSE Stream).
*   **Models**: `ChatSession` (persistence) and `ChatMessage` (history + JSON citations).
*   **AI Engine**: Integrated with **OpenAI GPT-4o** and **Claude 3.5 Sonnet** (depending on tier).
*   **Search**: Powered by **Qdrant** (Vector DB).

### Code Reference
*   [Chat Stream View](file:///home/abrhame/projects/mem2/teamos/backend/chat/views.py) — The RAG pipeline logic.
*   [Chat Models](file:///home/abrhame/projects/mem2/teamos/backend/chat/models.py) — The conversation storage.
*   [Vector Engine](file:///home/abrhame/projects/mem2/teamos/backend/ingest/vectors.py) — The retrieval backbone.

---

## 4. Future Roadmap
*   **Multi-Query Expansion**: Generating 3-5 variations of a user query to find even more relevant context.
*   **Cross-Encoder Re-ranking**: A second stage of AI ranking to ensure the absolute best 3 snippets are used for the final answer.
*   **Dynamic Tool-use**: Full integration for the AI to "Check Out" and "Commit" changes to the Wiki via the chat interface.
