"use client";

import { LegalLayout } from "@/components/legal/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="May 10, 2026">
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using TeamOS (the &quot;Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use the Service.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>
          TeamOS provides a team knowledge management and semantic reasoning platform, including wiki systems, knowledge graphs, and AI-powered intelligence tools.
        </p>
      </section>

      <section>
        <h2>3. User Accounts</h2>
        <p>
          To access most features of the Service, you must register for an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
        </p>
        <ul>
          <li>You must provide accurate and complete information.</li>
          <li>You are responsible for the security of your account.</li>
          <li>You must notify us immediately of any unauthorized use.</li>
        </ul>
      </section>

      <section>
        <h2>4. Subscription and Billing</h2>
        <p>
          Some parts of the Service are billed on a subscription basis. You will be billed in advance on a recurring and periodic basis (monthly).
        </p>
        <ul>
          <li>Payments are processed securely via Paddle.</li>
          <li>Subscription fees are based on the number of active seats in your workspace.</li>
          <li>You can cancel your subscription at any time via the billing settings.</li>
        </ul>
      </section>

      <section>
        <h2>5. Content Ownership</h2>
        <p>
          You retain all rights to the data and content you upload or create within TeamOS. We do not claim ownership over your workspace data.
        </p>
      </section>

      <section>
        <h2>6. Acceptable Use</h2>
        <p>
          You agree not to use the Service for any unlawful purposes or to conduct any illegal activity. You may not attempt to reverse engineer or disrupt the technical architecture of TeamOS.
        </p>
      </section>

      <section>
        <h2>7. Limitation of Liability</h2>
        <p>
          In no event shall TeamOS be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or use.
        </p>
      </section>

      <section>
        <h2>8. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at support@team-os.tech.
        </p>
      </section>
    </LegalLayout>
  );
}
