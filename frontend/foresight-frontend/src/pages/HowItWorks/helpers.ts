/**
 * Non-component helpers for the HowItWorks page: the reveal-on-scroll hook
 * and the scroll-anchor item type. Lives in its own file so the components
 * file can satisfy `react-refresh/only-export-components`.
 *
 * @module pages/HowItWorks/helpers
 */

import { useEffect, useRef, useState } from "react";

/** Returns a ref to attach + a `visible` flag that flips true the first
 *  time the target intersects the viewport at `threshold` ratio. */
export function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/** A scroll target consumed by the right-side anchor nav. */
export interface AnchorItem {
  id: string;
  label: string;
}
