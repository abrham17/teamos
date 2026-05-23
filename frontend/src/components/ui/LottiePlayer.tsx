"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  {
    ssr: false,
    loading: () => <Loader2 className="animate-spin text-[var(--accent)]" aria-hidden />,
  },
);

export interface LottiePlayerProps {
  src: string;
  className?: string;
  width?: number;
  height?: number;
  loop?: boolean;
  autoplay?: boolean;
  "aria-label"?: string;
}

export function LottiePlayer({
  src,
  className,
  width = 48,
  height = 48,
  loop = true,
  autoplay = true,
  "aria-label": ariaLabel = "Loading animation",
}: LottiePlayerProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (reduceMotion) {
    return (
      <div
        role="status"
        aria-label={ariaLabel}
        className={cn(
          "rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin",
          className,
        )}
        style={{ width, height }}
      />
    );
  }

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width, height }}
    >
      <DotLottieReact
        src={src}
        loop={loop}
        autoplay={autoplay}
        style={{ width, height }}
      />
    </div>
  );
}
