import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[var(--bg-900)] text-[var(--text-primary)] flex items-center justify-center px-6">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          TeamOS
        </h1>
        <p className="mt-4 text-[var(--text-muted)] text-lg">
          Build a shared team brain with wiki pages, graph context, and
          citation-first chat.
        </p>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Show when="signed-out">
            <SignInButton>
              <button className="px-4 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-colors">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-950)] font-semibold hover:opacity-90 transition-opacity">
                Create account
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            <Link
              href="/wiki"
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-950)] font-semibold hover:opacity-90 transition-opacity"
            >
              Open workspace
            </Link>
            <Link
              href="/user-management"
              className="px-4 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-colors"
            >
              User management
            </Link>
          </Show>
        </div>
      </div>
    </main>
  );
}
