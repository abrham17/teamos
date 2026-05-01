# TeamOS API Contract

This document defines the API contract for all core backend processes in TeamOS.

## Base Information

- Base URL (local): `http://localhost:8000/api`
- Auth:
  - Bearer token (`Authorization: Bearer <token>`) via Clerk JWT
  - Cookie JWT (`access_token`, `refresh_token`) for session-style auth
- Default content type: `application/json`
- Team-scoped routes use `team_id` in the path

---

## Standard Response Envelope

Most JSON endpoints follow:

### Success

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

- `meta` is optional.

### Error

```json
{
  "success": false,
  "error": {
    "message": "Human readable message",
    "code": "machine_readable_code",
    "details": {}
  }
}
```

- `code` and `details` are optional.

### Known Exceptions

- `204 No Content` endpoints return empty body.
- Streaming endpoint `chat/.../query/` uses SSE (`text/event-stream`).
- Export endpoints return binary/file responses on success.

---

## Authentication and User Provisioning (`/api/auth`)

### `POST /auth/register/`
- Creates user and sets JWT cookies.
- Request:
  - `email`, `password`, optional `username`, `first_name`, `last_name`
- Response: `success=true`, `data=<User>`

### `POST /auth/login/`
- Logs user in and sets JWT cookies.
- Request:
  - `email`, `password`
- Response: `success=true`, `data=<User>`

### `POST /auth/logout/`
- Clears JWT cookies.
- Response: `success=true`, `data.detail="Logged out."`

### `GET /auth/me/`
- Returns current user profile.
- Response: `success=true`, `data=<User>`

### `POST /auth/provision/`
- Ensures first team membership exists for first-time users.
- Response:
  - `success=true`
  - `data.user`, `data.team`, `data.role`, `data.provisioned`

---

## Teams and Membership (`/api/auth/teams/...`)

### `GET /auth/teams/`
- Lists teams where caller is member.
- Response: `data=[Team]`

### `POST /auth/teams/`
- Creates team and caller owner membership.
- Request: `name`
- Error codes:
  - `team_name_required`

### `GET /auth/teams/{team_id}/`
- Returns team details + caller role.
- Response includes `my_role`.
- Error codes:
  - `team_not_found`

### `PATCH /auth/teams/{team_id}/`
- Owner-only team updates.
- Request: partial fields (currently `name`).
- Error codes:
  - `owner_required`

### `GET /auth/teams/{team_id}/members/`
- Lists team members.
- Error codes:
  - `forbidden`

### `PATCH /auth/teams/{team_id}/members/`
- Owner-only role update for non-owner members.
- Request:
  - `user_id`
  - `role` in `viewer | editor`
- Guardrails:
  - owner cannot self-change role
  - `owner` role assignment blocked here (must use transfer endpoint)
- Error codes:
  - `owner_required`
  - `user_id_required`
  - `owner_self_role_change_forbidden`
  - `invalid_member_role`
  - `team_member_not_found`

### `DELETE /auth/teams/{team_id}/members/`
- Owner-only member removal with email confirmation.
- Request:
  - `user_id`
  - `confirmation_email` (must match current account email)
- Guardrails:
  - owner removal blocked unless ownership transferred first
- Success: `204 No Content`
- Error codes:
  - `owner_required`
  - `invalid_confirmation_email`
  - `user_id_required`
  - `team_member_not_found`
  - `owner_removal_forbidden`

### `POST /auth/teams/{team_id}/transfer-ownership/`
- Owner-only ownership transfer with email confirmation.
- Request:
  - `new_owner_user_id`
  - `confirmation_email`
- Behavior:
  - caller owner -> editor
  - target member -> owner
- Error codes:
  - `owner_required`
  - `invalid_confirmation_email`
  - `new_owner_user_id_required`
  - `already_owner`
  - `new_owner_not_member`

### `GET /auth/teams/{team_id}/audit-events/`
- Lists up to 100 recent team audit events.
- Roles: owner/editor
- Error codes:
  - `forbidden`
  - `editor_or_owner_required`

---

## Invites (`/api/auth/teams/.../invite...`)

### `POST /auth/teams/{team_id}/invite/`
- Creates invite and triggers async email dispatch.
- Request:
  - `invitee_email`
  - `role` in `owner | editor | viewer`
- Editor cannot invite owner.
- Error codes:
  - `forbidden`
  - `editor_cannot_invite_owner`

### `GET /auth/teams/{team_id}/invites/`
- Lists invites for team (owner/editor).
- Each invite includes:
  - `send_status`
  - `lifecycle_status` (`pending | accepted | revoked | expired`)
  - `accept_url`

### `POST /auth/teams/{team_id}/invites/{invite_id}/resend/`
- Re-dispatch invite email if valid.
- Error codes:
  - `forbidden`
  - `invite_not_found`
  - `invite_already_accepted`
  - `invite_already_revoked`
  - `invite_expired`

### `POST /auth/teams/{team_id}/invites/{invite_id}/revoke/`
- Revokes invite.
- Error codes:
  - `forbidden`
  - `invite_not_found`
  - `invite_already_revoked`

### `POST /auth/teams/accept-invite/`
- Accepts invite token idempotently.
- Request:
  - `token`
- Response includes:
  - team data
  - `invite_status` in `accepted | already_accepted`
- Error codes:
  - `invite_token_required`
  - `invalid_invite_token`
  - `invite_revoked`
  - `invite_expired`
  - `invite_email_mismatch`
  - `invite_already_used`

---

## Wiki (`/api/wiki`)

### `GET /wiki/{team_id}/pages/`
- Lists non-deleted pages.
- Query:
  - `q` (search title/content)
  - `type` (page_type filter)

### `POST /wiki/{team_id}/pages/`
- Creates wiki page and triggers graph wiring task.
- Request:
  - `title`
  - `content`
  - optional `page_type`, `frontmatter`

### `GET /wiki/{team_id}/pages/{slug}/`
- Fetches page detail.
- Error codes:
  - `forbidden`
  - `wiki_page_not_found`

### `PUT /wiki/{team_id}/pages/{slug}/`
- Updates page and rewires graph.
- Supports title rename with slug regeneration.

### `DELETE /wiki/{team_id}/pages/{slug}/`
- Soft-deletes page and removes related graph edges.
- Success: `204 No Content`

### `GET /wiki/{team_id}/pages/{slug}/backlinks/`
- Returns pages linking to target page with snippet context.

### `GET /wiki/{team_id}/pages/{slug}/unlinked/`
- Returns pages mentioning target title without wikilink.

### `GET /wiki/{team_id}/search/?q=...`
- Search helper endpoint (max 20).

### `GET /wiki/{team_id}/recent/`
- Returns recent pages (max 10).

### `GET /wiki/{team_id}/templates/`
- Returns built-in and team templates.

---

## Graph (`/api/graph`)

### `GET /graph/{team_id}/`
- Returns graph payload:
  - `nodes[]` with rank/cluster metadata
  - `edges[]`

### `GET /graph/{team_id}/nodes/{page_id}/`
- Returns node details and neighbors.
- Error codes:
  - `graph_node_not_found`

### `GET /graph/{team_id}/hubs/`
- Returns high-centrality pages.

### `GET /graph/{team_id}/orphans/`
- Returns pages with no edges.

### `GET /graph/{team_id}/analytics/`
- Returns cached analytics summary.

### `POST /graph/{team_id}/edges/`
- Creates manual edge.
- Request:
  - `from_page_id`
  - `to_page_id`
  - optional `edge_type` (default `manual`)
- Error codes:
  - `graph_edge_page_not_found`

### `DELETE /graph/{team_id}/edges/`
- Deletes edge by `edge_id`.
- Success: `204 No Content`

---

## Chat (`/api/chat`)

### `GET /chat/{team_id}/sessions/`
- Lists caller-owned chat sessions.

### `POST /chat/{team_id}/sessions/`
- Creates session.
- Request:
  - optional `title`

### `GET /chat/{team_id}/sessions/{session_id}/`
- Returns session detail + messages.
- Error codes:
  - `chat_session_not_found`

### `DELETE /chat/{team_id}/sessions/{session_id}/`
- Deletes caller-owned session.
- Success: `204 No Content`
- Error codes:
  - `chat_session_not_found`

### `POST /chat/{team_id}/sessions/{session_id}/query/` (SSE)
- Streaming RAG query endpoint.
- Request:
  - `message`
- Error codes (non-stream prechecks):
  - `chat_session_not_found`
  - `message_required`

#### SSE Events

- `status`
  - payload: `{ "status": "..." }`
- `citations`
  - payload: `{ "citations": [ ... ] }`
  - citation includes:
    - `page_id`, `page_title`, `page_slug`
    - `snippet`, `score`
    - optional `chunk_id`, `anchor_hint`
- `chunk`
  - payload: `{ "token": "..." }`
- `done`
  - payload: `{ "status": "done" }`
- `error`
  - payload: `{ "detail": "..." }`

---

## Ingestion (`/api/ingest`)

### `GET /ingest/{team_id}/jobs/`
- Returns latest 10 ingest jobs.
- Error codes:
  - `team_not_found`

### `POST /ingest/{team_id}/url/`
- Creates URL ingest job and dispatches async task.
- Request:
  - `url`
- Error codes:
  - `team_not_found`
  - `url_required`

### `POST /ingest/{team_id}/file/`
- Creates file ingest job and dispatches async task.
- Multipart request:
  - `file`
- Error codes:
  - `team_not_found`
  - `file_required`
  - `empty_file_upload`
  - `file_text_extraction_failed`

---

## Export (`/api/export`)

### `GET /export/{team_id}/wiki/`
- Returns ZIP attachment containing:
  - `pages/*.md`
  - `sources/*_raw.txt` (if available)
  - `_graph.json`
  - `metadata.json`
- Errors use envelope:
  - `forbidden`

### `GET /export/{team_id}/page/{slug}/`
- Returns markdown attachment for one page.
- Errors use envelope:
  - `forbidden`
  - `wiki_page_not_found`

---

## Frontend Contract Notes

The frontend API client (`frontend/src/lib/api.ts`) supports:

- Envelope responses (`success/data/error`)
- Legacy non-envelope JSON responses
- Plain text errors
- `204` empty responses

This allows progressive endpoint migration without frontend breakage.

---

## Process Flows (End-to-End)

### Invite and Join Flow
1. Owner/editor creates invite.
2. Async email task sends invite link with token.
3. Invitee opens `/accept-invite`.
4. Invitee submits token to `accept-invite`.
5. Membership is created idempotently and audit event logged.

### Team Membership Governance
1. Owner can promote/demote non-owner members (`viewer <-> editor`).
2. Owner can remove non-owner members with email confirmation.
3. Ownership transfer is explicit endpoint with email confirmation.

### Knowledge Authoring Flow
1. Create/update wiki page.
2. Async graph wiring runs.
3. Graph endpoints expose structure and analytics.
4. Chat retrieves relevant chunks and emits citations.
5. Citation deep-link routes user back to wiki with context hints.

### Ingestion to Retrieval Flow
1. URL/file ingest creates job.
2. Async worker processes source into chunks/embeddings.
3. Chat retrieval queries vector store.
4. Citations include page slug and optional chunk/anchor hints.

### Export Flow
1. Authorized member requests export.
2. API streams binary file response (ZIP or markdown).
3. Errors follow standard envelope.

---

## Versioning and Compatibility

- Current API is unversioned in path.
- Recommended next step: introduce `/api/v1` namespace before any breaking schema changes.
- Envelope migration is largely complete for core modules; remaining non-core endpoints should align before version freeze.

## Contract Sources of Truth

- API request/response behavior and flow semantics: `API_CONTRACT.md`
- Capability lifecycle status (`implemented/partial/planned`): `docs/capability-matrix.md`
