"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export interface IllustrationProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export function Illustration({
  src,
  alt,
  className,
  width = 280,
  height = 210,
  priority = false,
}: IllustrationProps) {
  const isSvg = src.endsWith(".svg");

  if (isSvg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={cn("mx-auto max-h-[210px] w-auto opacity-90", className)}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={cn("mx-auto max-h-[210px] w-auto opacity-90 object-contain", className)}
    />
  );
}
