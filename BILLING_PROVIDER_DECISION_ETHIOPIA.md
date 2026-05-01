# Billing Provider Decision (Ethiopia Context)

This document explains **what was implemented**, **how it works**, and **why this provider path was chosen** for TeamOS given that the business operates from Ethiopia.

## Executive Decision

- **Current backend supports:** `paddle` and `stripe` adapters via one provider boundary.
- **Recommended default for Ethiopia:** `paddle`.
- **Why now:** Stripe does not list Ethiopia as a direct merchant onboarding country on Stripe global availability.
- **Recommended go-live path for Ethiopia:** Use a Merchant-of-Record model first (Paddle), then optionally switch to or add Stripe when/if you operate a legal entity in a Stripe-supported country.

## What We Implemented

### 1) Provider-agnostic billing boundary

Implemented in backend:

- `billing.providers.BaseBillingProvider`
- `billing.providers.PaddleBillingProvider`
- `billing.providers.StripeBillingProvider`
- `billing.providers.get_billing_provider()`

This keeps TeamOS code independent from one gateway and supports provider switching via environment variable without rewriting business flows.

### 2) Checkout creation endpoint

- Endpoint: `POST /api/billing/{team_id}/checkout-session/`
- Owner-only access.
- Returns provider + checkout URL payload.

### 3) Webhook ingestion with idempotency

- Endpoint: `POST /api/billing/webhook/{provider_name}/`
- Signature check (provider-specific):
  - Paddle: `Paddle-Signature` + `Paddle-Timestamp`, signed payload format `timestamp:raw_body`, replay-window tolerance.
  - Stripe: `Stripe-Signature` header path under Stripe adapter boundary.
- Idempotency store model:
  - `billing.BillingWebhookEvent` (`provider`, `event_id`) unique
- Safe replay behavior:
  - repeated events return `already_processed=true` without duplicating state.

### 4) Subscription state model

- `billing.TeamSubscription`
- Holds normalized subscription state independent of provider naming differences.

### 5) Async reconciliation loop

- Task: `billing.tasks.reconcile_pending_billing_webhooks`
- Purpose:
  - retries processing for pending/unprocessed webhook events
  - reduces manual ops when provider callbacks fail transiently
- Admin trigger endpoint:
  - `POST /api/billing/reconcile/` (staff-only)
- Automatic cadence:
  - Celery Beat schedule runs reconciliation every 15 minutes for automatic recovery.

## Why Paddle for Ethiopia

### Practical constraints

- Stripe’s official global availability page is the source of truth for direct onboarding.
- Ethiopia is not listed as a direct Stripe merchant country there.
- Paddle’s supported-country docs include Ethiopia and Paddle operates as Merchant of Record (MoR), which reduces tax/compliance burden.

### Operational impact

- **Faster launch:** fewer compliance and tax operations to build in-house.
- **Lower legal complexity:** MoR handles tax collection/remittance responsibilities.
- **Safer fallback:** if a provider rule changes, TeamOS still uses a provider abstraction layer.

## Stripe vs Paddle in this setup

- **Stripe:** best when you already have a supported-country legal entity and want deep payment customization.
- **Paddle:** better launch fit for Ethiopia-first operations where MoR and global tax handling matter more than payment-stack control.

## What to Configure

Add environment variables:

- `BILLING_PROVIDER=paddle`
- `BILLING_WEBHOOK_SECRET=<secret>`
- `PADDLE_WEBHOOK_SECRET=<secret>`
- `PADDLE_WEBHOOK_TOLERANCE_SECONDS=300`
- `STRIPE_WEBHOOK_SECRET=<secret>` (when using Stripe adapter)

## Implementation Notes

- Paddle webhook flow now includes timestamp tolerance checks to reduce replay risk.
- Adapter boundary keeps verification/parsing provider-specific without changing API endpoints or data models.

## Sources (Official Docs)

- [Stripe global availability](https://stripe.com/global)
- [Stripe support country list article](https://support.stripe.com/questions/what-countries-does-stripe-support)
- [Paddle supported countries (developer docs)](https://developer.paddle.com/concepts/sell/supported-countries-locales)
- [Paddle sanctions/supported regions help center](https://www.paddle.com/help/legal/sanctions/which-countries-are-supported-by-paddle)
