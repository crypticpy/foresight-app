/**
 * Shared component primitives for the HowItWorks page: animated number
 * counter, the Section wrapper used by every step, and its co-located
 * TechNote disclosure. The `useReveal` hook and `AnchorItem` type live in
 * `./helpers` to keep this file component-only (react-refresh).
 *
 * @module pages/HowItWorks/_shared
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Wand2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useReveal } from "./helpers";

// ---------------------------------------------------------------------------
// Animated number counter — eases from 0 to target when in viewport
// ---------------------------------------------------------------------------

export function CountUp({
  value,
  duration = 1400,
  className,
}: {
  value: number | null | undefined;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || value == null) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            const start = performance.now();
            const from = 0;
            const to = value;
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              // easeOutCubic
              const eased = 1 - Math.pow(1 - t, 3);
              setDisplay(Math.round(from + (to - from) * eased));
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [value, duration]);

  if (value == null) {
    return (
      <span ref={ref} className={className}>
        <span className="text-gray-300 dark:text-gray-600">—</span>
      </span>
    );
  }
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display.toLocaleString()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper with scroll-triggered fade/slide
// ---------------------------------------------------------------------------

interface SectionProps {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  icon: ReactNode;
  children?: ReactNode;
  techNote?: string;
  alternate?: boolean;
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  icon,
  children,
  techNote,
  alternate = false,
}: SectionProps) {
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section
      id={id}
      className={cn(
        "py-16 md:py-24 transition-colors",
        alternate && "bg-white/60 dark:bg-dark-surface-deep/40",
      )}
    >
      <div
        ref={ref}
        className={cn(
          "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-700 ease-out",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
        )}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-brand-blue/10 text-brand-blue dark:text-brand-blue">
            {icon}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-blue">
            {eyebrow}
          </span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 max-w-3xl">
          {title}
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mb-8 leading-relaxed">
          {intro}
        </p>
        {children}
        {techNote && <TechNote>{techNote}</TechNote>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Disclosure for "Under the hood" technical detail
// ---------------------------------------------------------------------------

function TechNote({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8 max-w-3xl">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "group inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all duration-200",
          open
            ? "border-brand-blue text-brand-blue bg-brand-blue/5"
            : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-blue hover:text-brand-blue",
        )}
      >
        <Wand2 className="h-3.5 w-3.5" />
        Under the hood
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open
            ? "grid-rows-[1fr] opacity-100 mt-3"
            : "grid-rows-[0fr] opacity-0 mt-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="rounded-xl bg-gray-900 dark:bg-black/40 border border-gray-800 dark:border-gray-700 shadow-lg overflow-hidden">
            {/* Terminal chrome */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/80 dark:bg-black/60 border-b border-gray-700/60">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
              </div>
              <div className="ml-2 text-[10px] font-mono uppercase tracking-wider text-gray-400">
                tech-detail.md
              </div>
              <div className="ml-auto flex items-center gap-1 text-[10px] font-mono text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-green animate-pulse" />
                live
              </div>
            </div>
            <div className="p-5 text-sm text-gray-200 leading-relaxed font-mono border-l-2 border-brand-blue">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
