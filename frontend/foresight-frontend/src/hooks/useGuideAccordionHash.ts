/**
 * Drives a Radix `<Accordion.Root type="multiple">` on the guide pages so it:
 *
 *   1. opens the first section on initial load -- a friendlier landing state
 *      for non-technical pilot users than an all-collapsed wall of headings,
 *      and
 *   2. opens (and smooth-scrolls to) the section a deep link points at, e.g.
 *      `/guide/workstreams#kanban`, both when the page first loads with the
 *      hash present and on later in-page hash changes.
 *
 * Pass the section `value` strings in render order; each must equal the
 * `value`/`id` on its `<Accordion.Item>`. Returns the controlled
 * `[value, onValueChange]` pair to spread onto `<Accordion.Root>`.
 *
 * @module hooks/useGuideAccordionHash
 */

import { useEffect, useRef, useState } from "react";

/** The section a valid `#hash` deep link points at, or null. */
function hashSection(sections: string[]): string | null {
  if (typeof window === "undefined") return null;
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return hash && sections.includes(hash) ? hash : null;
}

export function useGuideAccordionHash(
  sections: string[],
): [string[], (value: string[]) => void] {
  // Latest section list, readable inside the mount effect without making it a
  // dependency. The list is conceptually static per guide, but callers may
  // pass a fresh inline array each render -- that must not re-run the listener
  // wiring (which would re-open a section the user just closed).
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const [value, setValue] = useState<string[]>(() => {
    const fromHash = hashSection(sections);
    if (fromHash) return [fromHash];
    const [first] = sections;
    return first ? [first] : [];
  });

  useEffect(() => {
    function openFromHash() {
      const match = hashSection(sectionsRef.current);
      if (!match) return;
      setValue((prev) => (prev.includes(match) ? prev : [...prev, match]));
      // Defer the scroll one frame so the section has begun expanding and the
      // target element is laid out before we bring it into view.
      requestAnimationFrame(() => {
        document
          .getElementById(match)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    // Cover a hash present at load (deep link) plus later in-page hash changes.
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  return [value, setValue];
}
