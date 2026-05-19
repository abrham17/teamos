"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { Mic, Sparkles, X } from "lucide-react";

import { graphChromePrefersReducedMotion } from "@/lib/graphChromeMotion";

export type VoiceOverlayPhase = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  open: boolean;
  onClose: () => void;
  phase: VoiceOverlayPhase;
  caption: string;
  interimTranscript: string;
  listening: boolean;
  speechSupported: boolean;
  /** Disable starting listening while a reply is streaming */
  micDisabled?: boolean;
  /** Orb tap toggles listen/stop (primary voice control). */
  onOrbClick: () => void;
}

export function VoiceChatOverlay({
  open,
  onClose,
  phase,
  caption,
  interimTranscript,
  listening,
  speechSupported,
  micDisabled = false,
  onOrbClick,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !shellRef.current || graphChromePrefersReducedMotion()) return;
    const el = shellRef.current;
    const a = animate(el, {
      scale: [0.88, 1],
      opacity: [0, 1],
      duration: 480,
      ease: "outCubic",
    });
    return () => {
      try {
        a.revert();
      } catch {
        /* ignore */
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !orbRef.current || graphChromePrefersReducedMotion()) return;
    const pulse =
      phase === "listening" || phase === "thinking" || phase === "speaking" || listening;
    if (!pulse) return;
    const el = orbRef.current;
    const big = phase === "speaking" ? 1.06 : phase === "thinking" ? 1.04 : 1.03;
    const a = animate(el, {
      scale: [1, big, 1],
      duration: phase === "listening" ? 720 : 900,
      ease: "inOutSine",
      loop: true,
      alternate: true,
    });
    return () => {
      try {
        a.revert();
      } catch {
        /* ignore */
      }
    };
  }, [open, phase, listening]);

  useEffect(() => {
    if (!open || !ringRef.current || graphChromePrefersReducedMotion()) return;
    if (phase !== "thinking" && phase !== "speaking") return;
    const el = ringRef.current;
    const a = animate(el, {
      rotate: [0, 360],
      duration: 16000,
      ease: "linear",
      loop: true,
    });
    return () => {
      try {
        a.revert();
      } catch {
        /* ignore */
      }
    };
  }, [open, phase]);

  if (!open) return null;

  const orbDisabled = !speechSupported || (micDisabled && !listening);
  const orbLabel = listening ? "Stop listening" : "Start listening";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-950)]/80 p-6 backdrop-blur-sm motion-reduce:backdrop-blur-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-chat-title"
    >
      <div
        ref={shellRef}
        className="relative flex w-full max-w-lg flex-col items-center gap-8 rounded-[2rem] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-8 py-10 shadow-[var(--shadow-lg)] [pointer-events:none]"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-xl p-2 text-[var(--text-muted)] transition-colors [pointer-events:auto] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          aria-label="Close voice chat"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-800)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            <Sparkles className="h-3 w-3 text-[var(--text-muted)]" aria-hidden />
            Voice mode
          </div>
          <h2 id="voice-chat-title" className="text-xl font-bold text-[var(--text-primary)]">
            Ask out loud
          </h2>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            Tap the orb to speak or stop. We listen in your browser, then search your wiki and answer. Spoken replies
            use cloud text-to-speech when configured.
          </p>
        </div>

        <div className="relative flex h-52 w-52 items-center justify-center [pointer-events:auto]">
          <div
            ref={ringRef}
            className="absolute inset-0 rounded-full border border-dashed border-[var(--border-subtle)] opacity-70"
            aria-hidden
          />
          <button
            type="button"
            ref={orbRef}
            disabled={orbDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onOrbClick();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!orbDisabled) onOrbClick();
              }
            }}
            aria-pressed={listening}
            aria-label={orbLabel}
            className="relative flex h-40 w-40 cursor-pointer items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--accent)] text-[var(--bg-950)] shadow-md outline-none transition-[box-shadow,transform] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--border-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Mic className="h-14 w-14 drop-shadow-sm" aria-hidden />
          </button>
        </div>

        <div className="min-h-[4.5rem] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-900)] px-4 py-3 text-center text-sm text-[var(--text-secondary)]">
          {caption ? <p className="leading-relaxed">{caption}</p> : null}
          {interimTranscript ? (
            <p className="mt-2 text-xs italic text-[var(--text-dim)]">{interimTranscript}</p>
          ) : null}
        </div>

        {!speechSupported ? (
          <p className="text-center text-xs text-amber-400/90">
            Speech recognition isn&apos;t available in this browser. Use Chrome or Edge on desktop, or type in the
            main chat.
          </p>
        ) : null}
      </div>
    </div>
  );
}
