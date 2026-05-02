import { animate, stagger } from "animejs";

type ChromeAnimation = ReturnType<typeof animate>;

export function graphChromePrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface GraphChromeEnterRefs {
  toolbar: HTMLElement | null;
  canvas: HTMLElement | null;
  analyticsCards: HTMLElement[];
  legend: HTMLElement | null;
}

function revertAll(animations: ChromeAnimation[]) {
  for (const a of animations) {
    try {
      a.revert();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Staggered enter for graph page chrome (not Cytoscape canvas internals).
 * Returns a cleanup that reverts animations.
 */
export function runGraphChromeEnter(refs: GraphChromeEnterRefs): () => void {
  if (graphChromePrefersReducedMotion()) {
    return () => {};
  }

  const { toolbar, canvas, analyticsCards, legend } = refs;
  const animations: ChromeAnimation[] = [];

  const ease = "outCubic" as const;
  const base = { duration: 420, ease };

  if (toolbar) {
    animations.push(
      animate(toolbar, {
        ...base,
        opacity: [0, 1],
        translateY: [-10, 0],
      }),
    );
  }

  if (canvas) {
    animations.push(
      animate(canvas, {
        ...base,
        delay: 40,
        opacity: [0, 1],
        scale: [0.985, 1],
      }),
    );
  }

  if (analyticsCards.length > 0) {
    animations.push(
      animate(analyticsCards, {
        ...base,
        delay: stagger(70, { start: 80, from: "first" }),
        opacity: [0, 1],
        translateX: [-12, 0],
      }),
    );
  }

  if (legend) {
    animations.push(
      animate(legend, {
        ...base,
        delay: 160,
        opacity: [0, 1],
        translateY: [14, 0],
      }),
    );
  }

  return () => revertAll(animations);
}

export interface OverlayEnterRefs {
  root: HTMLElement | null;
  /** Optional extra nodes to stagger after root (e.g. icon then text). */
  staggerChildren?: HTMLElement[];
}

export function runGraphOverlayEnter(refs: OverlayEnterRefs): () => void {
  if (graphChromePrefersReducedMotion()) {
    return () => {};
  }

  const { root, staggerChildren = [] } = refs;
  if (!root) return () => {};

  const targets = [root, ...staggerChildren].filter(Boolean);
  const anim = animate(targets, {
    duration: 380,
    ease: "outCubic",
    delay: stagger(55, { from: "first" }),
    opacity: [0, 1],
    translateY: [8, 0],
    scale: [0.98, 1],
  });

  return () => {
    try {
      anim.revert();
    } catch {
      /* ignore */
    }
  };
}
