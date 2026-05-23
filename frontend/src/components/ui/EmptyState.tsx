"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Illustration } from "@/components/ui/Illustration";

export interface EmptyStateProps {
  illustrationSrc: string;
  illustrationAlt: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  illustrationSrc,
  illustrationAlt,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-3 px-4 py-6" : "gap-4 px-6 py-10",
        className,
      )}
    >
      <Illustration
        src={illustrationSrc}
        alt={illustrationAlt}
        width={compact ? 200 : 280}
        height={compact ? 150 : 210}
        className={compact ? "max-h-[140px]" : undefined}
      />
      <div className="space-y-2 max-w-md">
        <h3
          className={cn(
            "font-semibold text-[var(--text-primary)]",
            compact ? "text-sm" : "text-base",
          )}
        >
          {title}
        </h3>
        {description ? (
          <p
            className={cn(
              "text-[var(--text-muted)] leading-relaxed",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
