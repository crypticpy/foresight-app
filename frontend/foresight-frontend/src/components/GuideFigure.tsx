/**
 * Framed product screenshot for the in-app guide pages. Renders an image
 * with a subtle rounded border + ring that reads well on both the light
 * (`brand-faded-white`) and dark (`brand-dark-blue`) guide backgrounds, plus
 * an optional centered caption.
 *
 * Screenshots live in `public/guide/` and are referenced by root-absolute
 * path (e.g. `/guide/discover-feed.png`).
 *
 * @module components/GuideFigure
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GuideFigureProps {
  /** Root-absolute path under `public/`, e.g. `/guide/discover-feed.png`. */
  src: string;
  /** Required alt text describing the screenshot for screen readers. */
  alt: string;
  /** Optional caption rendered beneath the image. */
  caption?: ReactNode;
  /** Optional class overrides (e.g. margin) merged via `cn`. */
  className?: string;
  /**
   * Eager-load the image instead of lazy. Set on above-the-fold hero shots
   * so they don't defer their (LCP-relevant) load; in-accordion figures keep
   * the default lazy behavior since their section is collapsed on first paint.
   */
  eager?: boolean;
  /**
   * Intrinsic pixel dimensions, used to reserve aspect-ratio space and avoid
   * layout shift. Defaults match the standardized guide capture (1440×900 @2×).
   */
  width?: number;
  height?: number;
}

export function GuideFigure({
  src,
  alt,
  caption,
  className,
  eager = false,
  width = 2880,
  height = 1800,
}: GuideFigureProps) {
  return (
    <figure className={cn("my-6 print:break-inside-avoid", className)}>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="w-full h-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      />
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
