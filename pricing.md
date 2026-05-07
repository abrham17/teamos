# TeamOS Pricing & Cost Architecture (May 2026)

This document outlines the operational mechanics of the TeamOS billing system, revenue model, and the autonomous cost-management layer (LLM Orchestrator).

## 1. Plan Tiers & Per-User Pricing

TeamOS has moved to a strict **Per-User** pricing model. There are no base fees or hidden minimums.

| Tier | Price | Seat Limit | Key Features | LLM Engine |
| :--- | :--- | :--- | :--- | :--- |
| **Free Trial** | $0 | 1–3 | 60-day window | GPT-4.1-Nano |
| **Team** | $15 /user | Unrestricted | Standard RAG, Core Graph | GPT-4o-Mini floor |
| **Pro** | $20 /user | Unrestricted | Priority AI, Priority Support | GPT-4o floor (High Priority) |

---

## 2. LLM Orchestrator: Autonomous Cost Management

The **LLM Orchestrator** is a middleware layer that ensures every team remains profitable by managing the "Spend Ratio" in real-time.

### Continuous Cost Curve
Instead of hard token quotas, TeamOS uses a **probabilistic routing engine**. As a team uses more tokens and approaches their monthly budget, the system shifts the "mix" of models used.

*   **Logic**: `r = random.random()` vs `Weight(SpendRatio)`
*   **Result**: Users experience a gradual shift in quality (e.g., more GPT-4o-mini responses) rather than a 403 error.

### Budget Allocation (Revenue-to-API)
Revenue is automatically split between **Platform Margin** and **API Budget**:

| Plan | Revenue/User | API Budget % | Tokens/User (Est.) |
| :--- | :--- | :--- | :--- |
| **Team** | $15.00 | 30% ($4.50) | ~5M tokens (mixed) |
| **Pro** | $20.00 | 50% ($10.00) | ~20M tokens (priority) |

---

## 3. Pro Tier Privileges

The Pro Tier ($20/user) isn't just about more tokens; it is about **Priority Architecture**:

1.  **Zero-Nano Floor**: Pro users are never routed to "Nano" models, even when over budget. Their minimum experience is always GPT-4o-mini.
2.  **Extended 4o Window**: Pro users stay on GPT-4o for 95% of their budget cycle, whereas Team users begin cost-shifting at 60%.
3.  **Operation Priority**: High-value tasks (Chat Agents, Project Planning) are locked to GPT-4o for Pro users.

---

## 4. Admin Revenue & Unit Economics

The system is designed for a **60–80% Gross Margin**.

### Economics per 1,000 Users:
*   **Gross Revenue**: $17,500 (Mixed Team/Pro avg)
*   **Platform Margin (70%)**: $12,250
*   **API Cost Pool (30%)**: $5,250
*   **Server/Infra Cost**: ~$500
*   **Net Profit**: ~$11,750 / month

---

## 5. Subscription Lifecycle

### 60-Day Free Trial
New teams get 60 days of full access with a 3-seat limit. 
*   **Day 61**: Account status moves to `trial_expired`.
*   **Action**: API access blocked. Data is preserved but "locked" until upgrade.

### Grace Period & Suspension
1.  **Payment Failure**: Status moves to `past_due`.
2.  **Grace Period (7 Days)**: Team stays active but is downgraded to "Free" level performance (GPT-4.1-Nano only) to protect margins.
3.  **Suspension**: If no payment after 7 days, status moves to `suspended`. All API access is revoked.

---

## 6. Implementation Details (Backend)

*   **Pricing Math**: `backend/billing/pricing.py`
*   **Budgeting**: `backend/llm_orchestrator/budget.py`
*   **Routing Logic**: `backend/llm_orchestrator/router.py`
*   **Enforcement**: `backend/teamos_project/entitlements.py`
*   **Middleware**: `backend/llm_orchestrator/middleware.py`
