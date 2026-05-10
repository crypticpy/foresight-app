/**
 * Top-of-page scroll progress bar — pinned just below the global nav, fills
 * left-to-right as the user scrolls through the HowItWorks page.
 *
 * @module pages/HowItWorks/ScrollProgressBar
 */

import { useEffect, useState } from "react";

export function ScrollProgressBar() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-16 left-0 right-0 h-0.5 z-40 pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-brand-blue to-brand-green transition-[width] duration-100"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
