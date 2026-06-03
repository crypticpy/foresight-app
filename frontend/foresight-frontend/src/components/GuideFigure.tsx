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
}

export function GuideFigure({
  src,
  alt,
  caption,
  className,
}: GuideFigureProps) {
  return (
    <figure className={cn("my-6 print:break-inside-avoid", className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      />
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
