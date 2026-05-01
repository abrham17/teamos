# Product Analytics Event Dictionary

This document defines canonical analytics events and ownership for TeamOS Module L.

## Canonical Events

- `workspace_created`
  - **Owner:** `accounts`
  - **When:** a new team workspace is created.
  - **Properties:** `source`

- `first_page_created`
  - **Owner:** `wiki`
  - **When:** first non-deleted wiki page for a team is created.
  - **Properties:** `page_id`, `page_slug`

- `first_ingest_completed`
  - **Owner:** `ingest`
  - **When:** first ingest job reaches `done` state for a team.
  - **Properties:** `job_id`, `source_type`

- `first_chat_answer_received`
  - **Owner:** `chat`
  - **When:** first assistant response is persisted for a team.
  - **Properties:** `session_id`

- `invite_sent`
  - **Owner:** `accounts`
  - **When:** invite creation succeeds.
  - **Properties:** `invite_id`, `role`

- `invite_accepted`
  - **Owner:** `accounts`
  - **When:** invite acceptance succeeds.
  - **Properties:** `invite_id`, `role`

- `upgrade_clicked`
  - **Owner:** `frontend/settings` + `product_analytics` API
  - **When:** user clicks plan upgrade CTA.
  - **Properties:** `surface`

- `subscription_started`
  - **Owner:** `billing`
  - **When:** first paid subscription becomes active.
  - **Properties:** `provider`, `plan_key`

## Query Surface

- Weekly funnel endpoint:
  - `GET /api/analytics/{team_id}/funnel/weekly/`
- Includes:
  - `week_start`
  - `event_name`
  - `count`

- Cohort summary endpoint (admin):
  - `GET /api/analytics/cohorts/weekly/`
- Includes:
  - `cohort_week_start`
  - `teams_created`
  - milestone counts (`first_page_created`, `first_ingest_completed`, `first_chat_answer_received`, `invite_accepted`, `subscription_started`)
- Query params:
  - `start_date` (`YYYY-MM-DD`, optional)
  - `end_date` (`YYYY-MM-DD`, optional)
  - `conversion_window_days` (`1..180`, optional, default `28`)

- Frontend analytics dashboard:
  - `/analytics`
  - Uses team funnel endpoint for all users and cohort endpoint for staff users.
