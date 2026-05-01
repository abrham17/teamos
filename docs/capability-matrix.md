# TeamOS Capability Matrix

This file is the single source of truth for feature capability status.

Status values:
- `implemented`: shipped and available in product/API
- `partial`: usable, but incomplete against intended behavior
- `planned`: not implemented yet

## Capability Table

| Capability ID | Module | Capability | Status | Primary Evidence | Release Notes | Verification Link |
|---|---|---|---|---|---|---|
| ACC-001 | Accounts | Register/login/logout/me with JWT cookies | implemented | `backend/accounts/views.py`, `backend/accounts/urls.py` | `TBD` | `backend/accounts/tests.py` |
| ACC-002 | Accounts | Clerk first-team provisioning | implemented | `backend/accounts/views.py` (`ClerkProvisionView`) | `TBD` | `manual: /api/auth/provision/` |
| ACC-003 | Team Mgmt | Team create/list/detail | implemented | `backend/accounts/views.py` (`TeamListCreateView`, `TeamDetailView`) | `TBD` | `manual: settings + teams API` |
| ACC-004 | Team Mgmt | Member role update (viewer/editor) owner-only | implemented | `backend/accounts/views.py` (`TeamMembersView.patch`) | `TBD` | `backend/accounts/tests.py` |
| ACC-005 | Team Mgmt | Member remove owner-only + email confirmation | implemented | `backend/accounts/views.py` (`TeamMembersView.delete`) | `TBD` | `backend/accounts/tests.py` |
| ACC-006 | Team Mgmt | Ownership transfer owner-only + email confirmation | implemented | `backend/accounts/views.py` (`TransferOwnershipView`) | `TBD` | `backend/accounts/tests.py` |
| ACC-007 | Team Mgmt | Team deletion flow (soft delete/hard delete worker) | implemented | `backend/accounts/views.py` (`TeamDetailView.delete`), `backend/accounts/tasks.py` (`purge_soft_deleted_team`), `frontend/src/app/(app)/settings/page.tsx` | `TBD` | `backend/accounts/tests.py` |
| INV-001 | Invites | Create/list/resend/revoke invite lifecycle | implemented | `backend/accounts/views.py`, `frontend/src/app/(app)/settings/page.tsx` | `TBD` | `backend/accounts/tests.py` |
| INV-002 | Invites | Accept invite with idempotent token handling | implemented | `backend/accounts/views.py` (`AcceptInviteView`) | `TBD` | `backend/accounts/tests.py` |
| INV-003 | Invites | Invite status model (`pending/accepted/revoked/expired`) | implemented | `backend/accounts/models.py` (`lifecycle_status`) | `TBD` | `manual: invites API` |
| WIKI-001 | Wiki | Wiki page CRUD + autosave editor workspace | implemented | `backend/wiki/views.py`, `frontend/src/components/wiki-v2/MarkdownWorkspace.tsx` | `TBD` | `manual: /wiki` |
| WIKI-002 | Wiki | Wikilink authoring (`[[...]]`) autocomplete | implemented | `frontend/src/components/editor/GoogleDocsEditor.tsx` | `TBD` | `manual: editor` |
| WIKI-003 | Wiki | Backlinks and unlinked mentions | implemented | `backend/wiki/views.py` (`WikiBacklinksView`, `WikiUnlinkedMentionsView`) | `TBD` | `manual: wiki API` |
| WIKI-004 | Wiki | Frontmatter panel roundtrip and usage parity | implemented | `frontend/src/components/wiki-v2/MarkdownWorkspace.tsx`, `frontend/src/components/wiki/FrontmatterPanel.tsx`, `backend/wiki/views.py` | `TBD` | `backend/wiki/tests.py` |
| GRA-001 | Graph | Graph nodes/edges retrieval endpoint | implemented | `backend/graph_engine/views.py` (`GraphView`) | `TBD` | `manual: /graph` |
| GRA-002 | Graph | Hubs/orphans/analytics insights | implemented | `backend/graph_engine/views.py` | `TBD` | `manual: graph endpoints` |
| GRA-003 | Graph | Manual edge create/delete | implemented | `backend/graph_engine/views.py` (`GraphEdgeCreateView`) | `TBD` | `manual: graph API` |
| GRA-004 | Graph | Advanced clustering semantics parity | implemented | `backend/graph_engine/analytics.py`, `backend/graph_engine/views.py`, `frontend/src/app/(app)/graph/page.tsx` | `TBD` | `backend/graph_engine/tests.py` |
| CHA-001 | Chat | Chat sessions CRUD | implemented | `backend/chat/views.py`, `frontend/src/components/chat/ChatInterface.tsx` | `TBD` | `manual: /chat` |
| CHA-002 | Chat | SSE streaming query with citations | implemented | `backend/chat/views.py` (`ChatQueryStreamView`) | `TBD` | `manual: /chat` |
| CHA-003 | Chat | Citation deep-link to wiki context | implemented | `frontend/src/components/chat/ChatInterface.tsx`, `frontend/src/components/wiki-v2/MarkdownWorkspace.tsx` | `TBD` | `manual: click citation chip` |
| ING-001 | Ingest | URL ingestion job creation | implemented | `backend/ingest/views.py` (`UrlIngestView`) | `TBD` | `manual: /ingest` |
| ING-002 | Ingest | File ingestion job creation | implemented | `backend/ingest/views.py` (`FileIngestView`) | `TBD` | `manual: /ingest` |
| ING-003 | Ingest | Job list/history endpoint | implemented | `backend/ingest/views.py` (`IngestJobListView`) | `TBD` | `manual: /ingest` |
| ING-004 | Ingest | Stage-by-stage progress telemetry/events | implemented | `backend/ingest/models.py`, `backend/ingest/pipeline.py`, `backend/ingest/tasks.py`, `frontend/src/app/(app)/ingest/page.tsx` | `TBD` | `backend/ingest/tests.py` |
| EXP-001 | Export | Full wiki ZIP export with graph payload | implemented | `backend/export_app/views.py` (`ExportWikiView`) | `TBD` | `manual: settings export` |
| EXP-002 | Export | Single page markdown export | implemented | `backend/export_app/views.py` (`ExportPageView`) | `TBD` | `manual: export endpoint` |
| EXP-003 | Export | Role-restricted export policy hardening | implemented | `backend/export_app/views.py` (owner/editor export policy) | `TBD` | `backend/export_app/tests.py` |
| DOC-001 | Platform | Standard API response envelope | implemented | `backend/teamos_project/api_response.py`, migrated views | `TBD` | `API_CONTRACT.md` |
| DOC-002 | Platform | Full API contract documentation | implemented | `API_CONTRACT.md` | `TBD` | `API_CONTRACT.md` |
| DOC-003 | Docs | Capability registry governance process | implemented | this file | `TBD` | `docs/capability-matrix.md` |
| BIZ-001 | Monetization | Plan entitlements enforcement backend | implemented | `backend/teamos_project/entitlements.py`, integrated in wiki/ingest/chat/export/accounts views | `TBD` | `backend/export_app/tests.py`, `backend/chat/tests.py`, `backend/ingest/tests.py`, `backend/accounts/tests.py` |
| BIZ-002 | Monetization | Billing/subscription provider integration | implemented | `backend/billing/providers.py`, `backend/billing/views.py`, `backend/billing/tasks.py` | `TBD` | `backend/billing/tests.py` |
| BIZ-003 | Analytics | Activation/conversion analytics instrumentation | implemented | `backend/product_analytics/*`, `frontend/src/app/(app)/analytics/page.tsx` | `TBD` | `backend/product_analytics/tests.py`, `manual: /analytics` |

## Registry Governance

- Update this matrix whenever capability behavior changes.
- Do not mark `implemented` without:
  - a concrete endpoint/UI reference in `Primary Evidence`
  - at least one verification link (`test`, `manual flow`, or doc contract)
- Move `Release Notes` from `TBD` to actual changelog/PR entry as process matures.
- If capability regresses, set status back to `partial` and add reason in PR description.
