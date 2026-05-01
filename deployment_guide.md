# TeamOS — Deployment & Infrastructure Guide

This guide provides a deep technical overview of how to deploy, scale, and maintain the TeamOS platform. TeamOS is a distributed system designed for high-performance knowledge ingestion and real-time collaboration.

---

## 1. The Production Stack

To run TeamOS in a production environment, you need the following services:

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | Next.js (App Router) | Client UI, SSE Streaming, TipTap Editor. |
| **API Backend** | Django (DRF) | Business logic, RBAC, Wiki management. |
| **Real-time** | Django Channels | WebSockets for Presence and Collaboration. |
| **Primary DB** | PostgreSQL | Metadata, Wiki content, Audit logs, Chat sessions. |
| **Vector DB** | Qdrant | Semantic embeddings and conceptual search. |
| **Task Queue** | Celery + Redis | Background Ingestion, Graph Inference, AI Tasks. |
| **Cache/PubSub** | Redis | WebSocket backing and real-time presence registry. |

---

## 2. Environment Variables (.env)

The following keys are required for the system to function. You must define these in your deployment environment.

### AI & Search (Crucial)
*   `OPENAI_API_KEY`: Required for embeddings and RAG (Chat).
*   `QDRANT_URL`: URL of your Qdrant instance (e.g., `http://qdrant:6333`).
*   `QDRANT_API_KEY`: Optional, for Qdrant Cloud or protected instances.

### Database & Broker
*   `DATABASE_URL`: Connection string for PostgreSQL.
*   `REDIS_URL`: Connection string for Redis (used for both Caching and Celery).
*   `CELERY_BROKER_URL`: Usually the same as `REDIS_URL`.

### Security & Frontend
*   `SECRET_KEY`: Django's secret key for signing tokens.
*   `FRONTEND_URL`: The public URL of your Next.js app (for CORS and Email Invites).
*   `ALLOWED_HOSTS`: Comma-separated list of backend domains.
*   `CORS_ALLOWED_ORIGINS`: Comma-separated list of frontend domains.

---

## 3. Deployment Alternatives

### Option A: Docker Compose (Recommended for Small/Medium Teams)
This is the simplest way to deploy. It runs all services on a single Linux machine.
*   **Pros**: Easy setup, isolated services, simple updates.
*   **Cons**: Single point of failure, manual scaling.
*   **Mechanism**: A `docker-compose.yml` orchestrates the DB, Redis, Qdrant, API, Worker, and Frontend.

### Option B: Managed Cloud (Railway / Render / Render)
Best for rapid deployment without managing Linux servers.
*   **Pros**: Automated SSL, database management, easy horizontal scaling.
*   **Cons**: Higher cost than raw VPS.
*   **Mechanism**: Connect your GitHub repo, define the `Dockerfile`, and provide env keys.

### Option C: Enterprise Kubernetes
For high-scale environments requiring high availability.
*   **Pros**: Infinite scaling, self-healing, advanced networking.
*   **Cons**: High complexity and maintenance.
*   **Mechanism**: Helm charts or K8s manifests for each service.

---

## 4. What Happens During Deployment?

1.  **Containerization**: Both the Next.js and Django apps are built into Docker images.
2.  **Migration**: The `python manage.py migrate` command runs to setup the PostgreSQL schema.
3.  **Vector Init**: The first time the system runs, it checks for the Qdrant connection and prepares the team-specific collections.
4.  **Worker Boot**: Celery workers start listening for ingestion tasks (cloning repos, parsing PDFs).
5.  **Static/Assets**: Next.js builds the production bundle with optimized images and scripts.

---

## 5. Persistence & Storage

*   **Database**: Ensure you have an automated backup strategy for PostgreSQL.
*   **Vector Data**: The `/qdrant/storage` directory in the Qdrant container must be mapped to a **Persistent Volume**.
*   **Raw Files**: If you ingest massive repos/PDFs, we recommend using **AWS S3** or **Google Cloud Storage** for `raw_data` instead of the local filesystem.

---

## 6. Security Hardening Checklist

1.  **SSL/TLS**: Always serve TeamOS over HTTPS. Use Nginx or Traefik as a reverse proxy.
2.  **JWT Security**: Ensure `httponly` and `secure` flags are set for cookies in production.
3.  **Firewall**: Only expose ports `80` and `443`. Keep Redis, PostgreSQL, and Qdrant hidden in an internal network.
4.  **Secrets Hygiene**: Never commit your `.env` file to version control. Use a secret manager (Vault, GitHub Secrets).

---

## 7. Future Scaling

*   **Read Replicas**: As chat traffic grows, add read replicas for PostgreSQL.
*   **Vector Sharding**: Qdrant supports sharding across multiple nodes if your knowledge base reaches millions of documents.
*   **Worker Auto-scaling**: Scale the number of Celery workers based on the number of pending `IngestJobs`.


---

## 8. Technology Deep Dive: The Professional Perspective

To truly master the deployment of TeamOS, it is essential to understand the architectural rationale behind each choice in our stack.

### 🧱 Docker & Containerization
In modern engineering, **Docker** is the industry standard for ensuring environment parity. By encapsulating the application and its dependencies into an immutable **Image**, we eliminate "configuration drift." 
*   **Orchestration**: We use **Docker Compose** to manage the lifecycle of multi-container applications, ensuring that the network topology between your API and your databases is strictly defined and isolated from the host machine.

### 🏛️ PostgreSQL (Relational Database)
We chose **PostgreSQL** for its legendary reliability and **ACID compliance** (Atomicity, Consistency, Isolation, Durability). 
*   **Schema Rigor**: Unlike "NoSQL" databases, Postgres ensures that your team's knowledge graph metadata remains consistent. It acts as the "Source of Truth" for every wiki page, user role, and audit event.

### ⚡ Redis (In-Memory Data Store)
**Redis** serves two critical roles in TeamOS:
1.  **Caching**: It stores transient session data and presence states in RAM, providing sub-millisecond response times.
2.  **Message Brokering**: It acts as the "Post Office" for **Celery**, holding the queue of ingestion tasks until a worker is ready to process them.

### 🧠 Qdrant (Vector Database)
**Qdrant** is a specialized engine designed for **High-Dimensional Vector Search**. 
*   **Semantic Indexing**: When you ingest a document, the AI converts it into a "Vector" (a list of 1536 numbers). Qdrant indexes these vectors in a multi-dimensional space, allowing the system to perform **Cosine Similarity** searches to find conceptually related information instantly.

### ⚙️ Celery (Distributed Task Queue)
**Celery** is the heavy-lifter of the platform. By offloading resource-intensive operations—such as cloning massive Git repositories or performing complex AI inferences—to background workers, we ensure that the user interface remains responsive and fluid.

### 📡 SSE vs. WebSockets (Streaming Architectures)
*   **SSE (Server-Sent Events)**: A lightweight, unidirectional protocol used for streaming AI tokens. It is more efficient than WebSockets for "read-only" streams like the chat response.
*   **WebSockets**: A full-duplex, bi-directional protocol. We use this for **Yjs Collaboration**, allowing multiple editors to synchronize their cursors and text changes in real-time with zero latency.


---

## 9. Hands-On Deployment: The Config Files

We have provided a production-ready configuration that handles the entire TeamOS stack.

### 🍱 The Docker "Lunchboxes"
1.  **[Backend Dockerfile](file:///home/abrhame/projects/mem2/teamos/backend/Dockerfile)**: Packs the Python environment, Git tools, and the Daphne WebSocket server.
2.  **[Frontend Dockerfile](file:///home/abrhame/projects/mem2/teamos/frontend/Dockerfile)**: Multi-stage build for the Next.js UI, optimized for speed.
3.  **[Docker Compose](file:///home/abrhame/projects/mem2/teamos/docker-compose.yml)**: The "Master Plan" that connects everything.

### 🚀 Launching the Platform

Follow these steps to start TeamOS on your machine or server:

1.  **Set your API Key**:
    ```bash
    export OPENAI_API_KEY=your_key_here
    ```

2.  **Start all services**:
    ```bash
    docker-compose up --build -d
    ```
    *   `-d` runs it in "detached" mode (in the background).
    *   `--build` ensures you have the latest code inside the boxes.

3.  **Initialize the Database**:
    Wait a few seconds for the DB to be ready, then run the migrations:
    ```bash
    docker-compose exec backend python manage.py migrate
    ```

4.  **Create your first User**:
    ```bash
    docker-compose exec backend python manage.py createsuperuser
    ```

5.  **Access the App**:
    *   **Frontend**: [http://localhost:3000](http://localhost:3000)
    *   **Backend API**: [http://localhost:8000](http://localhost:8000)
    *   **Qdrant UI**: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

---

### 🔍 Monitoring & Logs

If something isn't working, check the heartbeat of your robots:
*   **See all logs**: `docker-compose logs -f`
*   **Check the Ingestion Worker**: `docker-compose logs -f worker`
*   **Restart a service**: `docker-compose restart backend`

---

**The TeamOS platform is now fully containerized and ready for production. Do you want to run a quick validation test on these files, or are you ready to hand this over to your DevOps team?**
