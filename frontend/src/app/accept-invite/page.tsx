"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { api } from "@/lib/api";

type AcceptState = "idle" | "submitting" | "accepted" | "already_accepted" | "error";
type AcceptInviteResponse = { invite_status?: "accepted" | "already_accepted" };

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const { isSignedIn, isLoaded } = useUser();

  const [state, setState] = useState<AcceptState>("idle");
  const [message, setMessage] = useState<string>("");

  const loginHref = useMemo(() => {
    const next = token ? `/accept-invite?token=${encodeURIComponent(token)}` : "/accept-invite";
    return `/login?redirect_url=${encodeURIComponent(next)}`;
  }, [token]);

  const acceptInvite = async () => {
    if (!token) {
      setState("error");
      setMessage("Missing invite token.");
      return;
    }

    setState("submitting");
    setMessage("");
    try {
      const response = await api.post<AcceptInviteResponse>("/auth/teams/accept-invite/", { token });
      const inviteStatus = response?.invite_status;
      if (inviteStatus === "already_accepted") {
        setState("already_accepted");
        setMessage("This invite was already accepted by your account.");
        return;
      }

      setState("accepted");
      setMessage("Invite accepted. You can now access this team.");
    } catch (err: unknown) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Failed to accept invite.");
    }
  };

  return (
    <div className="min-h-[calc(100vh-3rem)] w-full bg-[var(--bg-900)] text-[var(--text-primary)] flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
        <h1 className="text-xl font-semibold">Accept Team Invite</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Join your team workspace to collaborate on wiki, graph, and chat.
        </p>

        {!token && (
          <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            Invalid invite link. Missing token.
          </p>
        )}

        {isLoaded && !isSignedIn && (
          <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-800)] p-4">
            <p className="text-sm text-[var(--text-muted)]">Sign in with the invited email address to accept.</p>
            <Link
              href={loginHref}
              className="mt-3 inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg-950)]"
            >
              Go to Sign In
            </Link>
          </div>
        )}

        {isSignedIn && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={acceptInvite}
              disabled={!token || state === "submitting"}
              className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg-950)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "submitting" ? "Accepting..." : "Accept Invite"}
            </button>
            {(state === "accepted" || state === "already_accepted") && (
              <Link
                href="/wiki"
                className="inline-flex rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm hover:border-[var(--accent)]"
              >
                Go to Workspace
              </Link>
            )}
          </div>
        )}

        {message && (
          <p
            className={`mt-4 rounded-md px-3 py-2 text-sm ${
              state === "error"
                ? "border border-red-500/30 bg-red-500/10 text-red-300"
                : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
