# TeamOS — Management & Presence Module

The Management Module is the administrative backbone of TeamOS. It handles team formation, role-based security, and real-time user presence across the entire workspace.

---

## 1. Multi-Tenant Workspace Management

TeamOS is designed for collaborative team environments.
*   **Team Creation**: Users can create multiple "Workspaces" (Teams).
*   **Provisioning**: Automated onboarding flow for first-time users (Clerk integration ready).
*   **Invites & Onboarding**: Email-based invitation system with cryptographically secure tokens and expiration.

---

## 2. Role-Based Access Control (RBAC)

Security is enforced at the database level through the `TeamMember` model:
*   **Owner**: Full control over settings, billing, and member roles.
*   **Editor**: Can create/edit wiki pages and manage ingestion.
*   **Viewer**: Read-only access to the knowledge graph and chat.
*   **Audit Logging**: Every administrative action (invites, role changes) is recorded in the `TeamAuditEvent` log for compliance.

---

## 3. Real-time Presence & Awareness

TeamOS ensures you never feel alone in the workspace.
*   **User Tracking**: Live monitoring of which team members are online.
*   **Page Awareness**: See exactly which wiki page each member is currently viewing (e.g., *"Sarah is viewing 'Project Roadmap'..."*).
*   **Global Sync**: A dedicated WebSocket consumer (`PresenceConsumer`) broadcasts the team's activity registry in real-time.
*   **Editor Presence**: Integrated with **Yjs Awareness**, showing remote cursors and typing indicators within the TipTap editor.

---

## 4. Technical Architecture

*   **State Store**: Redis (via Django Cache) for high-frequency presence updates.
*   **Communication**: **Django Channels** (WebSockets) for real-time broadcast.
*   **Authentication**: JWT-based (Clerk or Internal) with secure HTTP-only cookies.
*   **Compliance**: `TeamAuditEvent` table for tracking management history.

### Code Reference
*   [Presence Consumer](file:///home/abrhame/projects/mem2/teamos/backend/presence/consumers.py) — The WebSocket handler.
*   [Presence State Manager](file:///home/abrhame/projects/mem2/teamos/backend/presence/presence_state.py) — The Redis-backed registry.
*   [Accounts Views](file:///home/abrhame/projects/mem2/teamos/backend/accounts/views.py) — RBAC and management API.

---

## 5. Future Roadmap
*   **Slack/Discord Sync**: Mirror team presence and notifications to external chat platforms.
*   **Usage Analytics**: Heatmaps of which wiki pages are most active in real-time.
*   **Granular Permissions**: File-level or Tag-level access restrictions for sensitive data.
