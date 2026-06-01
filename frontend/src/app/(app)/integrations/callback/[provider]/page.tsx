"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function OAuthCallbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const provider = params?.provider as string;
  const [fragmentParams, setFragmentParams] = useState<URLSearchParams | null>(null);
  const code = searchParams.get("code") || fragmentParams?.get("token") || fragmentParams?.get("code");
  const state = searchParams.get("state");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const callDone = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    setFragmentParams(hash ? new URLSearchParams(hash) : new URLSearchParams());
  }, []);

  useEffect(() => {
    if (callDone.current) return;
    if (provider === "trello" && fragmentParams === null) return;
    if (!provider || !code || !state) {
      setStatus("error");
      setErrorMsg("Missing required OAuth callback parameters.");
      return;
    }

    const completeCallback = async () => {
      callDone.current = true;
      try {
        await api.post("/api/integrations/callback/", {
          provider,
          code,
          state,
        });
        setStatus("success");
        setTimeout(() => {
          router.push("/settings?tab=integrations");
        }, 2500);
      } catch (err: unknown) {
        setStatus("error");
        const msg = err instanceof Error ? err.message : String(err ?? "Failed to finalize OAuth authorization.");
        setErrorMsg(msg || "Failed to finalize OAuth authorization.");
      }
    };

    completeCallback();
  }, [provider, code, state, router, fragmentParams]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.05),transparent_50%)] flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-[var(--surface-1)]/40 backdrop-blur-xl border border-[var(--border-subtle)] rounded-3xl p-8 text-center overflow-hidden shadow-2xl">
        {/* Glow Effects */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {status === "loading" && (
          <div className="space-y-6 relative z-10 py-6">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <Loader2 className="w-16 h-16 text-[var(--accent)] animate-spin opacity-40" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[14px] font-bold text-[var(--accent)] capitalize">
                  {provider ? provider[0] : ""}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Connecting {provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Service"}
              </h2>
              <p className="text-[13px] text-[var(--text-muted)] max-w-xs mx-auto">
                Securing credentials and configuring dynamic AI agent tools. Please hold tight...
              </p>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6 relative z-10 py-6 animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/5">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Connection Successful!
              </h2>
              <p className="text-[13px] text-[var(--text-muted)] max-w-xs mx-auto">
                Authorized successfully. Your AI agent now possesses dynamic tools for this integration.
              </p>
            </div>
            <p className="text-[11px] text-[var(--accent)] font-semibold animate-pulse pt-2">
              Redirecting back to settings...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6 relative z-10 py-6 animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-rose-500/5">
              <XCircle className="w-10 h-10 text-rose-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Connection Failed
              </h2>
              <p className="text-[13px] text-rose-400/90 font-medium px-4 py-2 rounded-xl bg-rose-500/5 border border-rose-500/10 max-w-xs mx-auto">
                {errorMsg}
              </p>
            </div>
            <button
              onClick={() => router.push("/settings?tab=integrations")}
              className="px-6 py-2 bg-[var(--bg-800)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text-primary)] rounded-xl transition-all cursor-pointer shadow-sm"
            >
              Back to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
