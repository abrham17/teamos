"use client";

import { LegalLayout } from "@/components/legal/LegalLayout";

export default function RefundPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="May 10, 2026">
      <section>
        <h2>1. Free Trial Period</h2>
        <p>
          TeamOS offers a full 60-day free trial for all new workspaces. This trial is intended to give you full access to our premium features so you can evaluate the Service before being charged.
        </p>
      </section>

      <section>
        <h2>2. Refund Eligibility</h2>
        <p>
          Because we offer an extensive 60-day free trial, we generally do not offer refunds once a paid subscription has begun. However, we may consider refund requests in the following exceptional circumstances:
        </p>
        <ul>
          <li>Technical issues that prevent you from using the Service for more than 48 hours.</li>
          <li>Accidental duplicate billing or mathematical errors in seat calculation.</li>
          <li>Fraudulent use of your credit card by a third party.</li>
        </ul>
      </section>

      <section>
        <h2>3. Cancellation</h2>
        <p>
          You can cancel your subscription at any time. Upon cancellation, your workspace will remain active until the end of your current billing period. No further charges will be applied.
        </p>
      </section>

      <section>
        <h2>4. How to Request a Refund</h2>
        <p>
          To request a refund, please email support@team-os.tech with your workspace name, the email associated with your account, and the reason for your request. We aim to respond to all requests within 3 business days.
        </p>
      </section>

      <section>
        <h2>5. Processing Refunds</h2>
        <p>
          If your refund is approved, it will be processed through Paddle, our payment provider. The credit will automatically be applied to your original method of payment. Please note that it may take 5-10 business days for the refund to appear on your statement.
        </p>
      </section>
    </LegalLayout>
  );
}
