# TeamOS Clerk + Django Authority Integration

This document explains what was implemented, why it was implemented, and how the new authentication/authorization path works across TeamOS modules.

---

## Why This Change

TeamOS needs a clean split:

- **Clerk** answers identity: who the user is.
- **Django** answers authority: what that user can do in TeamOS teams/workspaces.

This prevents frontend-only trust and keeps module permissions (wiki, graph, chat, ingest, export) enforced server-side.

---

## What Was Implemented

## 1) Hybrid DRF authentication (Clerk first, legacy fallback)

### Files

- `backend/accounts/authentication.py`
- `backend/teamos_project/settings/base.py`

### Implementation

- Added `ClerkJWTAuthentication`:
  - Reads `Authorization: Bearer <token>`.
  - Verifies JWT against Clerk JWKS (`PyJWKClient`) with:
    - issuer (`CLERK_ISSUER`)
    - audience (`CLERK_AUDIENCE`, optional)
    - signature/expiration checks.
  - Maps token `sub` to local `User.clerk_user_id`.
  - Auto-creates local user on first valid request.
  - Syncs profile fields (`email`, `first_name`, `last_name`, `avatar_url`) on subsequent requests.

- DRF authentication order in settings:
  1. `accounts.authentication.ClerkJWTAuthentication`
  2. `accounts.authentication.CookieJWTAuthentication`

### Why

- Supports Clerk as primary auth immediately.
- Preserves backward compatibility for existing cookie-based endpoints during migration.

---

## 2) TeamOS user mapping field

### Files

- `backend/accounts/models.py`
- `backend/accounts/migrations/0002_user_clerk_user_id.py`
- `backend/accounts/serializers.py`

### Implementation

- Added `clerk_user_id` to `User` model:
  - unique, nullable/blank for staged migration.
- Added migration to persist schema change.
- Exposed `clerk_user_id` in `UserSerializer`.

### Why

- Keeps Django as system-of-record for TeamOS data relations.
- Enables deterministic identity mapping from Clerk token subject to local user.

---

## 3) First-login provisioning endpoint

### Files

- `backend/accounts/views.py`
- `backend/accounts/urls.py`

### Implementation

- Added `POST /api/auth/provision/` (`ClerkProvisionView`):
  - If user already has membership, returns current team context.
  - If first login with no membership:
    - creates a personal team,
    - creates owner membership,
    - returns provisioned context.

### Why

- TeamOS modules are team-scoped; first login must create usable workspace context.

---

## 4) Shared team-access helper and role hierarchy

### Files

- `backend/accounts/team_access.py`

### Implementation

- Added reusable helpers:
  - `get_team_membership(user, team_id)`
  - `has_minimum_role(member, minimum_role)` with role order:
    - viewer < editor < owner

### Why

- Removes duplicated membership logic and aligns access checks across modules.

---

## 5) DRF class-level permission system (implemented)

### Files

- `backend/accounts/permissions.py`
- `backend/wiki/views.py`
- `backend/chat/views.py`
- `backend/graph_engine/views.py`
- `backend/ingest/views.py`

### Implementation

- Added reusable DRF permission classes:
  - `IsTeamMember`:
    - enforces team membership based on route `team_id`
    - injects `request.team_membership` for downstream usage
  - `CanEditWiki`:
    - allows read for all team members
    - requires editor/owner for write methods (`POST/PUT/PATCH/DELETE`)
  - `CanIngest`:
    - requires team membership and editor/owner role for ingest actions

- Refactored module views to class-level permissions:
  - Wiki:
    - list/detail use `CanEditWiki` (read for members, writes role-gated)
    - backlinks/search/recent/template use `IsTeamMember`
  - Chat:
    - session/query views use `IsTeamMember`
  - Graph:
    - read views use `IsTeamMember`
    - manual edge create/delete uses `CanEditWiki`
  - Ingest:
    - job list uses `IsTeamMember`
    - URL/file ingest uses `CanIngest`

- Fixed wiki slug update bug on title change:
  - compare old vs new title before assigning slug.

### Why

- Centralizes policy decisions instead of repeating inline checks in every method.
- Reduces risk of future authorization drift across modules.
- Enforces tenant boundaries and role behavior consistently.
- Removes known MVP security gap in ingest.

---

## 6) Frontend bearer-token bridge to Django

### Files

- `frontend/src/lib/api.ts`

### Implementation

- API helper now attempts to fetch Clerk session token in browser via `window.Clerk.session.getToken()`.
- Sends `Authorization: Bearer <token>` on all API requests when available.
- Keeps `credentials: "include"` for transition compatibility.

### Why

- Django now needs Clerk bearer JWT for primary auth class.
- This bridges Next.js Clerk session to DRF without rewriting every caller.

---

## 7) Frontend bootstrap provisioning call

### Files

- `frontend/src/components/auth/ProvisionUser.tsx`
- `frontend/src/app/(app)/layout.tsx`

### Implementation

- Added non-blocking one-time call to `/api/auth/provision/` when entering app shell.

### Why

- Ensures first-time Clerk users get a TeamOS team/membership before module pages load data.

---

## 8) Clerk env configuration for backend

### Files

- `backend/.env.production.example`
- `backend/teamos_project/settings/base.py`

### Variables added

- `CLERK_ISSUER`
- `CLERK_JWKS_URL`
- `CLERK_AUDIENCE`

### Why

- Required for secure JWT signature + claim verification.

---

## Request Lifecycle Now (TeamOS)

1. User signs in with Clerk in Next.js.
2. Frontend API client obtains Clerk token.
3. Django receives `Authorization: Bearer ...`.
4. `ClerkJWTAuthentication` verifies token via JWKS.
5. Django resolves/creates local user via `clerk_user_id`.
6. Module view checks team membership and role.
7. Request is authorized or denied server-side.

---

## Security Properties Improved

- Signature-based JWT verification against Clerk JWKS.
- Issuer and optional audience validation.
- Team membership enforced in ingest (previously omitted).
- Role gates standardized for editor-required write actions.
- Local authority model retained in Django for all TeamOS modules.

---

## Remaining Follow-ups (Recommended)

- Add integration tests for:
  - cross-team denial,
  - viewer ingestion denial,
  - first-login provisioning.
- Remove legacy Django login/register endpoints when Clerk-only migration is fully complete.
- Move any direct `window.Clerk` usage to Clerk SDK hooks/util wrappers if desired.

---

## 9) Team invite hardening (implemented)

### Files

- `backend/accounts/models.py`
- `backend/accounts/migrations/0003_invites_hardening_and_audit.py`
- `backend/accounts/serializers.py`
- `backend/accounts/views.py`
- `backend/accounts/urls.py`
- `backend/accounts/tasks.py`
- `backend/teamos_project/settings/base.py`
- `backend/.env.production.example`
- `frontend/src/app/(app)/settings/page.tsx`

### Implementation

- Invite model now includes:
  - `invitee_email` (required)
  - `revoked_at`
  - `accepted_by`
  - `send_status` (`pending|sent|failed`)
  - `sent_at`
- Added `TeamAuditEvent` model for invite lifecycle events:
  - `invite_created`
  - `invite_sent`
  - `invite_send_failed`
  - `invite_accepted`
  - `invite_revoked`

- Added invite email pipeline:
  - `accounts.tasks.send_team_invite_email` (Celery task)
  - sends invite email with accept URL
  - updates send status and writes audit events

- Invite creation now validates:
  - `invitee_email`
  - role choice
  - role escalation rule: editor cannot invite owner

- Invite acceptance now validates:
  - invite exists and is not used/revoked
  - invite is not expired
  - authenticated user email matches `invitee_email` (email-bound invite)

- Added lifecycle endpoints:
  - `GET /api/auth/teams/<team_id>/invites/`
  - `POST /api/auth/teams/<team_id>/invites/<invite_id>/resend/`
  - `POST /api/auth/teams/<team_id>/invites/<invite_id>/revoke/`
  - `GET /api/auth/teams/<team_id>/audit-events/`

- Frontend settings page now supports:
  - entering invitee email
  - selecting invite role
  - creating invite
  - listing invites with status
  - resend/revoke actions

### Why

- Removes bearer-token invite risk by binding acceptance to intended email.
- Adds basic operational reliability through async email pipeline + send status.
- Improves traceability and incident response with team-level audit events.
- Gives admins/editors visibility and control over invite lifecycle.

---

## Files Changed Summary

- `backend/accounts/models.py`
- `backend/accounts/migrations/0002_user_clerk_user_id.py`
- `backend/accounts/migrations/0003_invites_hardening_and_audit.py`
- `backend/accounts/authentication.py`
- `backend/accounts/serializers.py`
- `backend/accounts/views.py`
- `backend/accounts/urls.py`
- `backend/accounts/team_access.py`
- `backend/accounts/tasks.py`
- `backend/accounts/permissions.py`
- `backend/wiki/views.py`
- `backend/chat/views.py`
- `backend/graph_engine/views.py`
- `backend/ingest/views.py`
- `backend/teamos_project/settings/base.py`
- `backend/.env.production.example`
- `frontend/src/lib/api.ts`
- `frontend/src/components/auth/ProvisionUser.tsx`
- `frontend/src/app/(app)/layout.tsx`
- `frontend/src/app/(app)/settings/page.tsx`

