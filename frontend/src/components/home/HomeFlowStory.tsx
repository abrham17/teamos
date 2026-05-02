"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, WheelEvent } from "react";
import { animate } from "animejs";
import {
  BookOpen,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  Layers,
  ListOrdered,
  MessageSquare,
  Network,
  Sparkles,
} from "lucide-react";

import { graphChromePrefersReducedMotion } from "@/lib/graphChromeMotion";

const STEP_MS = 980;
const HOLD_MS = 2800;

type ScenePhase = "intro" | "pipeline";

export interface SceneMeta {
  id: string;
  label: string;
  title: string;
  body: string;
  phase: ScenePhase;
}

export const SCENES: SceneMeta[] = [
  {
    id: "scattered",
    label: "Scattered",
    title: "Knowledge everywhere, nowhere when you need it",
    body: "Docs, chats, and drives splinter across tools. Decisions fade—and a generic chat window cannot rebuild durable team memory.",
    phase: "intro",
  },
  {
    id: "wiki_memory",
    label: "Wiki + graph",
    title: "One shared wiki and living graph",
    body: "Capture truth in wiki pages and links. Your team builds context that survives handoffs and onboarding—not just this week's thread.",
    phase: "intro",
  },
  {
    id: "wiki_llm",
    label: "Wiki-first AI",
    title: "LLMs grounded in your wiki",
    body: "Chat and answers pull from wiki plus ingest, cite real pages, and stay aligned with how your team actually works—memory for the long run.",
    phase: "intro",
  },
  {
    id: "ingest",
    label: "Ingest",
    title: "Bring sources into the base",
    body: "Drop files and URLs into the same knowledge foundation your wiki grows from.",
    phase: "pipeline",
  },
  {
    id: "semantic",
    label: "Semantics",
    title: "Structure what it means",
    body: "Entities and chunks extracted so search and models share one semantic layer.",
    phase: "pipeline",
  },
  {
    id: "graph",
    label: "Graph",
    title: "See how ideas connect",
    body: "Wikilinks and ingest relationships surface as a navigable graph—not a flat folder.",
    phase: "pipeline",
  },
  {
    id: "queue",
    label: "Jobs",
    title: "Pipeline you can trust",
    body: "Parse, embed, rebuild graph—queued work stays visible as your corpus grows.",
    phase: "pipeline",
  },
  {
    id: "chat",
    label: "Chat",
    title: "Ask on top of team truth",
    body: "Questions run against wiki-backed context—not an anonymous model guess.",
    phase: "pipeline",
  },
  {
    id: "citations",
    label: "Citations",
    title: "Answers that point home",
    body: "Every grounded reply ties back to wiki pages and sources your team owns.",
    phase: "pipeline",
  },
];

const SCENE_COUNT = SCENES.length;

export function HomeFlowStory({ actions }: { actions?: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevViewportWRef = useRef(0);
  const [viewportW, setViewportW] = useState(0);
  const [active, setActive] = useState(0);
  const cancelledRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setViewportW(el.clientWidth);
    });
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  /* Sync track to `active`, then auto-advance after hold (skipped when reduced motion). */
  useEffect(() => {
    cancelledRef.current = false;
    const track = trackRef.current;
    if (!track || viewportW <= 0) {
      return () => {
        cancelledRef.current = true;
      };
    }

    const clearScheduleAndAnim = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (animRef.current) {
        try {
          animRef.current.revert();
        } catch {
          /* ignore */
        }
        animRef.current = null;
      }
    };

    if (graphChromePrefersReducedMotion()) {
      try {
        animate(track, { translateX: -active * viewportW, duration: 0 });
      } catch {
        /* ignore */
      }
      return () => {
        cancelledRef.current = true;
      };
    }

    clearScheduleAndAnim();

    const widthChanged = prevViewportWRef.current !== viewportW;
    prevViewportWRef.current = viewportW;
    const duration = widthChanged ? 0 : STEP_MS;

    const current = animate(track, {
      translateX: -active * viewportW,
      duration,
      ease: "outCubic",
    });
    animRef.current = current;

    void current.then(() => {
      if (cancelledRef.current) return;
      timeoutRef.current = setTimeout(() => {
        setActive((a) => (a + 1) % SCENE_COUNT);
      }, HOLD_MS);
    });

    return () => {
      cancelledRef.current = true;
      clearScheduleAndAnim();
    };
  }, [active, viewportW]);

  const goToScene = useCallback((index: number) => {
    const i = ((index % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT;
    setActive(i);
  }, []);

  const stepRelative = useCallback((delta: number) => {
    setActive((a) => (a + delta + SCENE_COUNT) % SCENE_COUNT);
  }, []);

  const onViewportKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepRelative(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepRelative(1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goToScene(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToScene(SCENE_COUNT - 1);
      }
    },
    [goToScene, stepRelative],
  );

  const onViewportWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      if (graphChromePrefersReducedMotion()) return;
      const dominantX = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!e.shiftKey && !dominantX) return;
      e.preventDefault();
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      if (delta > 0) stepRelative(1);
      else if (delta < 0) stepRelative(-1);
    },
    [stepRelative],
  );

  /* Per-scene copy entrance (same canvas as carousel) */
  useLayoutEffect(() => {
    if (graphChromePrefersReducedMotion() || viewportW <= 0) return undefined;

    const vp = viewportRef.current;
    if (!vp) return undefined;

    const root = vp.querySelector(`[data-scene-index="${active}"]`);
    const titleEl = root?.querySelector("[data-home-scene-title]");
    const bodyEl = root?.querySelector("[data-home-scene-body]");
    if (!titleEl || !bodyEl) return undefined;

    const titleAnim = animate(titleEl, {
      opacity: [0, 1],
      translateY: [-10, 0],
      duration: 480,
      ease: "outCubic",
    });
    const bodyAnim = animate(bodyEl, {
      opacity: [0, 1],
      translateY: [-8, 0],
      duration: 560,
      delay: 120,
      ease: "outCubic",
    });

    return () => {
      try {
        titleAnim.revert();
        bodyAnim.revert();
      } catch {
        /* ignore */
      }
    };
  }, [active, viewportW]);

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-900)]">
        <div className="flex h-9 shrink-0 items-center gap-2 bg-[var(--bg-950)]/35 px-4 sm:px-6">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
            <Sparkles className="h-3 w-3 text-[var(--accent)]" />
            TeamOS — wiki-first knowledge OS
          </span>
        </div>

        <div
          ref={viewportRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="TeamOS product story. Use steps below, arrow buttons, keyboard arrows, or Shift-scroll to move between scenes."
          aria-describedby="home-flow-story-hint"
          tabIndex={0}
          onKeyDown={onViewportKeyDown}
          onWheel={onViewportWheel}
          className="relative min-h-[12rem] flex-1 overflow-hidden bg-[var(--bg-950)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:ring-inset"
        >
          <p id="home-flow-story-hint" className="sr-only">
            Click a numbered step, use the side arrows, press left and right arrow keys, or hold Shift and scroll to
            change scenes. The story also advances automatically.
          </p>

          <button
            type="button"
            onClick={() => stepRelative(-1)}
            className="absolute left-1 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)]/90 text-[var(--text-primary)] shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:left-2"
            aria-label="Previous scene"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => stepRelative(1)}
            className="absolute right-1 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)]/90 text-[var(--text-primary)] shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:right-2"
            aria-label="Next scene"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>

          {viewportW > 0 && (
            <div
              ref={trackRef}
              className="flex h-full will-change-transform"
              style={{ width: viewportW * SCENE_COUNT }}
            >
              {SCENES.map((scene, i) => (
                <SceneSlide
                  key={scene.id}
                  scene={scene}
                  sceneIndex={i}
                  width={viewportW}
                  panelId={`home-scene-panel-${i}`}
                  tabId={`home-scene-tab-${i}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-900)] px-4 pb-1 pt-1 sm:px-6">
          <p className="text-center text-[10px] text-[var(--text-dim)]" aria-hidden="true">
            Click a step or use ← → · Shift + scroll · auto-play
          </p>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-2 bg-[var(--bg-900)] px-4 py-3 sm:px-6"
          role="tablist"
          aria-label="Story scenes"
        >
          {SCENES.map((scene, i) => {
            const on = i === active;
            const intro = scene.phase === "intro";
            return (
              <button
                key={scene.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`home-scene-panel-${i}`}
                id={`home-scene-tab-${i}`}
                title={scene.title}
                onClick={() => goToScene(i)}
                className={`rounded-full px-2.5 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  on
                    ? intro
                      ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
                      : "bg-[var(--accent)]/20 text-[var(--text-primary)] ring-1 ring-[var(--accent)]/45"
                    : "bg-[var(--surface-2)] text-[var(--text-dim)] hover:bg-[var(--surface-1)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <span className="tabular-nums opacity-70">{i + 1}</span> {scene.label}
              </button>
            );
          })}
        </div>
      </div>

      {actions ?? null}
    </div>
  );
}

function SceneSlide({
  scene,
  sceneIndex,
  width,
  panelId,
  tabId,
}: {
  scene: SceneMeta;
  sceneIndex: number;
  width: number;
  panelId: string;
  tabId: string;
}) {
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      data-scene-index={sceneIndex}
      className="flex h-full flex-col p-4 sm:p-5 sm:pl-14 sm:pr-14"
      style={{ width, minWidth: width }}
    >
      <h2
        data-home-scene-title
        className="text-base sm:text-lg font-semibold text-[var(--text-primary)] leading-snug"
      >
        {scene.title}
      </h2>
      <p
        data-home-scene-body
        className="mt-2 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed"
      >
        {scene.body}
      </p>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{illustrationFor(scene.id, sceneIndex)}</div>
    </div>
  );
}

function illustrationFor(id: string, sceneIndex: number): ReactNode {
  switch (id) {
    case "scattered":
      return <SlideScatteredVisual />;
    case "wiki_memory":
      return <SlideWikiGraphVisual uid={sceneIndex} />;
    case "wiki_llm":
      return <SlideWikiFirstLLMVisual />;
    case "ingest":
      return <SlideIngestVisual />;
    case "semantic":
      return <SlideSemanticVisual />;
    case "graph":
      return <SlideGraphVisual uid={sceneIndex} />;
    case "queue":
      return <SlideQueueVisual />;
    case "chat":
      return <SlideChatVisual />;
    case "citations":
      return <SlideCitationsVisual />;
    default:
      return null;
  }
}

function SlideScatteredVisual() {
  return (
    <div className="flex flex-1 flex-col justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-4">
      <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
        Today&apos;s reality
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        <ToolChip icon={<MessageSquare className="h-4 w-4" />} label="Threads" />
        <span className="text-[var(--text-dim)]">·</span>
        <ToolChip icon={<FolderOpen className="h-4 w-4" />} label="Drives" />
        <span className="text-[var(--text-dim)]">·</span>
        <ToolChip icon={<FileText className="h-4 w-4" />} label="Docs" />
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-8 w-14 rounded border border-dashed border-[var(--border-subtle)] bg-[var(--bg-900)]/80"
          />
        ))}
      </div>
      <p className="mt-3 text-center text-[10px] text-[var(--text-dim)]">
        Nothing ties it together when someone asks &quot;what did we decide?&quot;
      </p>
    </div>
  );
}

function ToolChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-[10px] text-[var(--text-secondary)]">
      {icon}
      {label}
    </div>
  );
}

function SlideWikiGraphVisual({ uid }: { uid: number }) {
  const gid = `wg-${uid}`;
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/35 p-4">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="flex flex-1 flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] p-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-[var(--accent)]">
            <BookOpen className="h-3.5 w-3.5" /> Team wiki
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-full rounded bg-[var(--surface-2)]" />
            <div className="h-2 rounded bg-[var(--surface-2)]" style={{ width: "80%" }} />
            <div className="h-2 rounded bg-[var(--surface-2)]" style={{ width: "55%" }} />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] p-2">
          <svg viewBox="0 0 200 120" className="h-full w-full max-h-28" aria-hidden>
            <defs>
              <linearGradient id={`${gid}-e`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <path d="M40 75 C70 45, 100 40, 130 55" stroke={`url(#${gid}-e)`} strokeWidth="2" fill="none" />
            <path d="M130 55 C150 65, 165 85, 172 100" stroke={`url(#${gid}-e)`} strokeWidth="2" fill="none" />
            <circle cx="40" cy="75" r="10" fill="#1d4ed8" />
            <circle cx="130" cy="55" r="12" fill="#06b6d4" />
            <circle cx="172" cy="100" r="9" fill="#8b5cf6" />
          </svg>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-[var(--text-muted)]">
        <Network className="h-3 w-3" /> Pages stay linked—context outlives any single chat
      </div>
    </div>
  );
}

function SlideWikiFirstLLMVisual() {
  return (
    <div className="flex flex-1 flex-col justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/35 p-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <div className="flex flex-col items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-900)] px-4 py-3">
          <BookOpen className="h-8 w-8 text-[var(--accent)]" />
          <span className="mt-1 text-[10px] font-medium text-[var(--text-secondary)]">Wiki &amp; ingest</span>
          <span className="mt-0.5 text-[9px] text-[var(--text-dim)]">Source of truth</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-[var(--text-dim)]">
          <span className="hidden text-lg sm:inline">→</span>
          <span className="text-[10px] sm:hidden">↓</span>
          <span className="text-[9px] uppercase tracking-wide">context</span>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-3">
          <Bot className="h-8 w-8 text-violet-300" />
          <span className="mt-1 text-[10px] font-medium text-violet-200">Grounded LLM</span>
          <span className="mt-0.5 text-[9px] text-violet-300/80">Citations, always</span>
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
        Models answer from team memory—not a blank slate each time.
      </p>
    </div>
  );
}

function SlideIngestVisual() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/50 px-4 py-6">
      <FileText className="h-10 w-10 text-[var(--accent)] opacity-90" />
      <p className="mt-3 text-center text-xs font-medium text-[var(--text-primary)]">
        Drop files or paste URLs
      </p>
      <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">Q4-Planning.md · api-spec.pdf</p>
    </div>
  );
}

function SlideSemanticVisual() {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 p-4">
      <div className="flex flex-wrap gap-1.5">
        {["Billing", "Auth", "Rollout", "SLA"].map((t) => (
          <span
            key={t}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300">
        <Check className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium">Indexed &amp; chunked</span>
      </div>
    </div>
  );
}

function SlideGraphVisual({ uid }: { uid: number }) {
  const gid = `sg-${uid}`;
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-900)] p-2">
      <div className="flex flex-1 items-center justify-center">
        <svg viewBox="0 0 280 160" className="h-full w-full max-h-36" aria-hidden>
          <defs>
            <linearGradient id={`${gid}-e`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <path d="M48 88 C90 40, 130 36, 168 56" stroke={`url(#${gid}-e)`} strokeWidth="2" fill="none" />
          <path d="M168 56 C200 72, 220 96, 236 120" stroke={`url(#${gid}-e)`} strokeWidth="2" fill="none" />
          <path d="M48 88 C78 118, 120 128, 156 124" stroke={`url(#${gid}-e)`} strokeWidth="2" fill="none" />
          <circle cx="48" cy="88" r="14" fill="#1d4ed8" />
          <circle cx="168" cy="56" r="16" fill="#06b6d4" />
          <circle cx="236" cy="120" r="12" fill="#8b5cf6" />
          <circle cx="156" cy="124" r="11" fill="#10b981" />
        </svg>
      </div>
      <p className="text-center text-[10px] text-[var(--text-muted)]">From wikilinks + ingest into one map</p>
    </div>
  );
}

function SlideQueueVisual() {
  const rows = [
    { name: "Parse & extract", status: "done" as const },
    { name: "Embeddings", status: "done" as const },
    { name: "Graph rebuild", status: "run" as const },
  ];
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
        <ListOrdered className="h-3 w-3" />
        Pipeline
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2.5 py-2 text-[11px]"
        >
          <span className="text-[var(--text-secondary)]">{r.name}</span>
          {r.status === "done" ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Check className="h-3 w-3" /> Done
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--accent)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              Running
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function SlideChatVisual() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/35 p-4">
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-2xl rounded-br-md bg-[var(--accent)]/25 px-3 py-2 text-left text-[11px] text-[var(--text-primary)]">
          <MessageSquare className="mb-1 inline h-3 w-3 opacity-70" /> What did we decide about billing rollout?
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-dim)]">
        <Bot className="h-3.5 w-3.5" />
        Grounded on wiki + ingest—not generic web fluff
      </div>
    </div>
  );
}

function SlideCitationsVisual() {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-4">
      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
        Rollout is gated on the auth hardening milestone—dates and owners live in your runbook, not in chat limbo.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">
          <GitBranch className="h-3 w-3" /> Runbook §3
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">
          <Layers className="h-3 w-3" /> Sprint notes
        </span>
      </div>
    </div>
  );
}
