# TeamOS — Platform Operations & Observability

Platform Ops is the "engine room" of TeamOS. It ensures the system is reliable, testable, and observable in production environments. We treat infrastructure and quality assurance as first-class citizens.

---

## 1. Automated Testing Suite

TeamOS implements a multi-layered testing strategy to prevent regressions in the knowledge pipeline:
*   **Unit Tests**: Focused on individual logic like `wikilink` parsing and frontmatter extraction.
*   **Pipeline Tests**: End-to-end verification of the ingestion flow (Extraction -> Chunking -> Vector Sync).
*   **RAG Validation**: Automated tests to ensure retrieval accuracy and citation grounding.

### Running Tests
```bash
python manage.py test ingest.tests
```

---

## 2. Structured Observability

To maintain a complex distributed system (Django + Celery + Qdrant), we use **Structured JSON Logging**:
*   **Traceability**: Every request and background task is assigned a `trace_id` for end-to-end debugging.
*   **Contextual Logs**: Errors are logged with full context (team_id, job_type, user_id), allowing for rapid incident response.
*   **Log Reference**: [Logging Utility](file:///home/abrhame/projects/mem2/teamos/backend/teamos_project/logging_utils.py).

---

## 3. CI/CD Pipeline (Planned)

The CI pipeline is designed to gate all changes behind quality checks:
1.  **Linting**: Enforcement of PEP8 and TypeScript strictness.
2.  **Automated Testing**: Blocking PR merges if any pipeline tests fail.
3.  **Security Scanning**: Automated checks for secret leakage and dependency vulnerabilities.

---

## 4. Deployment Architecture

TeamOS is optimized for **Containerized Deployment**:
*   **Orchestration**: Ready for Docker Compose or Kubernetes.
*   **Stateful Services**: Decoupled architecture for PostgreSQL, Redis, and Qdrant.
*   **Asynchronous Processing**: Heavy-duty ingestion and AI tasks are offloaded to **Celery Workers**.

---

## 5. Security & Hygiene

*   **Secrets Management**: Centralized `.env` configuration with strict validation for API keys (OpenAI, Qdrant).
*   **RBAC Enforcement**: Every API endpoint is protected by a team-aware permission layer.
*   **Audit Logging**: Management actions are persisted for administrative review.

### Code Reference
*   [Ingest Tests](file:///home/abrhame/projects/mem2/teamos/backend/ingest/tests.py) — Core quality assurance.
*   [Logging Utils](file:///home/abrhame/projects/mem2/teamos/backend/teamos_project/logging_utils.py) — The observability engine.
