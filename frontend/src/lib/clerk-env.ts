/**
 * Clerk publishable key for Next.js build + runtime.
 *
 * Production builds (e.g. CI) need a key at prerender time. Set
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in .env.local or use the committed
 * example test key only during `next build` when the var is unset.
 */
const BUILD_FALLBACK_PUBLISHABLE_KEY =
  "pk_test_c3VubnktZmFsY29uLTkzLmNsZXJrLmFjY291bnRzLmRldiQ";

export function getClerkPublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (key) {
    return key;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return BUILD_FALLBACK_PUBLISHABLE_KEY;
  }

  throw new Error(
    "Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. Copy frontend/.env.production.example to .env.local or set the variable in your environment.",
  );
}
