# TeamOS Pricing Architecture (May 2026)

This document outlines the operational mechanics of the TeamOS billing system, revenue model, and the autonomous cost-management layer (LLM Orchestrator).

## 1. Plan Tiers & Per-User Pricing

TeamOS has moved to a strict **Per-User** pricing model. There are no base fees or hidden minimums.

| Tier | Price | Seat Limit | Key Features | Intelligence Engine |
| :--- | :--- | :--- | :--- | :--- |
| **Free Trial** | $0 | 1–3 | 60-day window | Standard Intelligence |
| **Team** | $20 /user | Unrestricted | Standard RAG, Core Graph | High-Performance Routing |
| **Pro** | $30 /user | Unrestricted | Priority AI, Priority Support | Advanced Agentic Engine |

---

## 2. Token Budgeting & LLM Orchestration

Instead of hard token quotas, TeamOS uses a **probabilistic routing engine**. As a team uses more tokens and approaches their monthly budget, the system shifts the "mix" of models used.

*   **Logic**: `r = random.random()` vs `Weight(SpendRatio)`
*   **Result**: Users experience a gradual shift in quality rather than a 403 error.

### Budget Allocation (Revenue-to-API)
Revenue is automatically split between **Platform Margin** and **API Budget**:

| Plan | Price (Per User) | Budget Ratio | Est. Capacity (Per User) | Features |
| :--- | :--- | :--- | :--- | :--- |
| **Free** | $0 | N/A | 5,000 tokens | Trial, 1-3 seats, Nano engine |
| **Team** | $20 | 10% ($2) | **2M Tokens** | Proximity routing |
| **Pro** | $30 | 16% ($5) | **5M Tokens** | Priority, Planning |

---

## 3. The "Pro" Advantage

The Pro Tier ($30/user) isn't just about more tokens; it is about **Priority Architecture**:

1.  **High-Performance Floor**: Pro users are always routed to our most advanced reasoning models.
2.  **Extended Priority Window**: Pro users stay on high-performance compute for 95% of their budget cycle.
3.  **Advanced Agentic Memory**: Unlimited context windows for deep research tasks.

---

## 4. Margin Analysis & Sustainability

The system is designed for a **60–80% Gross Margin**.

### Economics per 1,000 Users:
*   **Gross Revenue**: $25,000 (Mixed Team/Pro avg)
*   **Platform Margin (70%)**: $17,500
*   **API Cost Pool (30%)**: $7,500
*   **Server/Infra Cost**: ~$500
*   **Net Profit**: ~$17,000 / month

---

## 5. Implementation Notes

*   **Webhook Sync**: Paddle seat counts are synced via `billing.providers.PaddleBillingProvider`.
*   **Budget Guardrails**: The LLM Orchestrator checks spend ratios in real-time before every generation.
*   **Seat Scaling**: Revenue pools are calculated at the team level: `TotalBudget = Sum(UserRevenue) * PlanRatio`.
