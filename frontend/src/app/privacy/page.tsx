"use client";

import { LegalLayout } from "@/components/legal/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="May 10, 2026">
      <section>
        <h2>1. Information We Collect</h2>
        <p>
          We collect information to provide better services to all our users. This includes:
        </p>
        <ul>
          <li><strong>Account Information:</strong> Name, email address, and profile data via Clerk.</li>
          <li><strong>Content Data:</strong> Knowledge blocks, wiki pages, and graph nodes you create.</li>
          <li><strong>Usage Data:</strong> How you interact with the service, processed via our internal analytics.</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Information</h2>
        <p>
          We use the information we collect to provide, maintain, protect, and improve our services, and to develop new ones.
        </p>
        <ul>
          <li>To personalize your experience in the workspace.</li>
          <li>To process payments and manage your subscription via Paddle.</li>
          <li>To provide AI-powered reasoning based on your knowledge base.</li>
        </ul>
      </section>

      <section>
        <h2>3. Data Security</h2>
        <p>
          We work hard to protect TeamOS and our users from unauthorized access to or unauthorized alteration, disclosure, or destruction of information we hold.
        </p>
        <ul>
          <li>We encrypt all data in transit using SSL/TLS.</li>
          <li>We use secure database encryption at rest.</li>
          <li>Authentication is handled by Clerk, a leader in identity security.</li>
        </ul>
      </section>

      <section>
        <h2>4. Data Sharing</h2>
        <p>
          We do not share your personal information with companies, organizations, or individuals outside of TeamOS except in the following cases:
        </p>
        <ul>
          <li><strong>With your consent:</strong> When you invite teammates to your workspace.</li>
          <li><strong>For external processing:</strong> We provide information to trusted partners like Paddle (payments) and Clerk (auth).</li>
          <li><strong>For legal reasons:</strong> If we are required by law to share information.</li>
        </ul>
      </section>

      <section>
        <h2>5. Your Rights</h2>
        <p>
          You have the right to access, update, or delete your personal data at any time. You can export your workspace data using our built-in export tools.
        </p>
      </section>

      <section>
        <h2>6. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact our data privacy officer at privacy@team-os.tech.
        </p>
      </section>
    </LegalLayout>
  );
}
