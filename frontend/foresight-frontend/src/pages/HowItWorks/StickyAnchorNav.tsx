/**
 * Sticky right-side anchor nav: dot list pinned to the page edge that
 * highlights whichever section is most visible in the viewport.
 *
 * @module pages/HowItWorks/StickyAnchorNav
 */

import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import type { AnchorItem } from "./helpers";

export function StickyAnchorNav({ items }: { items: AnchorItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the most-visible section in viewport
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0 && visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      { threshold: [0.2, 0.5, 0.8], rootMargin: "-80px 0px -40% 0px" },
    );
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Section navigation"
      className="hidden xl:flex flex-col gap-2 fixed right-6 top-1/2 -translate-y-1/2 z-30"
    >
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className="group flex items-center gap-3 justify-end"
          aria-label={it.label}
        >
          <span
            className={cn(
              "text-xs font-semibold transition-all duration-200",
              active === it.id
                ? "text-brand-blue dark:text-white opacity-100 translate-x-0"
                : "text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0",
            )}
          >
            {it.label}
          </span>
          <span
            className={cn(
              "h-2 w-2 rounded-full transition-all duration-200",
              active === it.id
                ? "bg-brand-blue scale-150"
                : "bg-gray-300 dark:bg-gray-600 group-hover:bg-brand-blue",
            )}
          />
        </a>
      ))}
    </nav>
  );
}
