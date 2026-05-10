/**
 * HowItWorks — interactive scrollytelling page that walks demo audiences
 * through every subsystem of Foresight, with live widgets pulling real data.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Radio,
  Compass,
  Brain,
  Search,
  Network,
  MessageSquare,
  FileText,
  Layers,
  ArrowRight,
  Rss,
  Filter,
  Hash,
  Gauge,
  Zap,
  Globe,
  BookOpen,
  Wand2,
  TrendingUp,
  Bookmark,
  Pin,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { API_BASE_URL } from "../lib/config";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Reveal-on-scroll hook
// ---------------------------------------------------------------------------

function useReveal<T extends HTMLElement>(threshold = 0.15) {
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

// ---------------------------------------------------------------------------
// Animated number counter — eases from 0 to target when in viewport
// ---------------------------------------------------------------------------

function CountUp({
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
// Top scroll progress bar
// ---------------------------------------------------------------------------

function ScrollProgressBar() {
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

// ---------------------------------------------------------------------------
// Sticky right-side anchor nav (highlights active section)
// ---------------------------------------------------------------------------

interface AnchorItem {
  id: string;
  label: string;
}

function StickyAnchorNav({ items }: { items: AnchorItem[] }) {
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

// ---------------------------------------------------------------------------
// Live API speed ping — small "API: 47ms" pill
// ---------------------------------------------------------------------------

function SpeedMetric() {
  const [ms, setMs] = useState<number | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const start = performance.now();
        const res = await fetch(`${API_BASE_URL}/api/v1/health`, {
          method: "GET",
        });
        const elapsed = Math.round(performance.now() - start);
        if (!cancelled) {
          setErr(!res.ok);
          setMs(elapsed);
        }
      } catch {
        if (!cancelled) setErr(true);
      }
    }
    ping();
    const id = setInterval(ping, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-white/90">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full animate-pulse",
          err ? "bg-amber-400" : "bg-brand-green",
        )}
      />
      API: {ms == null ? "…" : err ? "offline" : `${ms}ms`}
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

function Section({
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

// ---------------------------------------------------------------------------
// Live system stats strip
// ---------------------------------------------------------------------------

interface SystemStats {
  total_cards: number;
  active_cards: number;
  cards_this_week: number;
  cards_this_month: number;
}

function StatStrip() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [patternCount, setPatternCount] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const headers = {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        };
        const [statsRes, patternsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/analytics/system-stats`, { headers }),
          fetch(
            `${API_BASE_URL}/api/v1/pattern-insights?status=active&limit=50`,
            { headers },
          ),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (patternsRes.ok) {
          const data = await patternsRes.json();
          setPatternCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {
        /* silent — page still works without live stats */
      }
    }
    load();
  }, []);

  const items = [
    {
      label: "Signal cards indexed",
      value: stats?.total_cards,
      icon: Radio,
      to: "/signals",
    },
    {
      label: "Active this month",
      value: stats?.cards_this_month,
      icon: TrendingUp,
      to: "/discover",
    },
    {
      label: "New this week",
      value: stats?.cards_this_week,
      icon: Sparkles,
      to: "/discover/queue",
    },
    {
      label: "Patterns detected",
      value: patternCount,
      icon: Brain,
      to: "/patterns",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 md:p-6">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.label}
              to={it.to}
              className="group flex flex-col items-start p-3 rounded-xl bg-gray-50 dark:bg-dark-surface-deep hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 transition-colors"
            >
              <div className="flex items-center justify-between w-full">
                <Icon className="h-4 w-4 text-brand-blue mb-2" />
                <ArrowRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 group-hover:text-brand-blue group-hover:translate-x-0.5 transition-all" />
              </div>
              <CountUp
                value={it.value}
                className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {it.label}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline conveyor illustration
// ---------------------------------------------------------------------------

function PipelineDiagram() {
  const stages = [
    { icon: Rss, label: "Fetch" },
    { icon: Filter, label: "Triage" },
    { icon: Hash, label: "Embed" },
    { icon: Layers, label: "Classify" },
    { icon: Gauge, label: "Score" },
    { icon: Radio, label: "Card" },
  ];
  const [active, setActive] = useState(0);
  const { ref, visible } = useReveal<HTMLDivElement>(0.25);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % stages.length);
    }, 1400);
    return () => clearInterval(id);
  }, [visible, stages.length]);

  return (
    <div
      ref={ref}
      className="relative bg-gradient-to-br from-brand-blue/5 via-transparent to-brand-green/5 dark:from-brand-blue/10 dark:to-brand-green/10 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 md:p-10 overflow-hidden"
    >
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-2 relative z-10">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          return (
            <div
              key={s.label}
              className="flex flex-col items-center text-center"
            >
              <div
                className={cn(
                  "relative h-14 w-14 md:h-16 md:w-16 rounded-2xl flex items-center justify-center border shadow-sm transition-all duration-500",
                  isActive
                    ? "bg-brand-blue border-brand-blue scale-110 shadow-lg shadow-brand-blue/30"
                    : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-700",
                )}
              >
                {isActive && (
                  <span className="absolute inset-0 rounded-2xl ring-4 ring-brand-blue/30 animate-ping" />
                )}
                <Icon
                  className={cn(
                    "h-6 w-6 transition-colors duration-300",
                    isActive ? "text-white" : "text-brand-blue",
                  )}
                />
                <span
                  className={cn(
                    "absolute -top-2 -left-2 h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors duration-300",
                    isActive
                      ? "bg-white text-brand-blue"
                      : "bg-brand-blue text-white",
                  )}
                >
                  {i + 1}
                </span>
              </div>
              <div
                className={cn(
                  "mt-2 text-xs font-semibold transition-colors duration-300",
                  isActive
                    ? "text-brand-blue dark:text-white"
                    : "text-gray-700 dark:text-gray-200",
                )}
              >
                {s.label}
              </div>
              {i < stages.length - 1 && (
                <ArrowRight className="hidden md:block absolute h-4 w-4 text-brand-blue/50 mt-7 ml-[5.5rem] pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-lg p-4 bg-white/60 dark:bg-dark-surface/60">
          <div className="font-semibold text-gray-900 dark:text-white mb-1">
            Fetch &amp; Triage
          </div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            RSS feeds, NewsAPI, and curated sources stream in continuously. A
            triage layer drops anything off-topic before any AI cost is spent.
          </p>
        </div>
        <div className="rounded-lg p-4 bg-white/60 dark:bg-dark-surface/60">
          <div className="font-semibold text-gray-900 dark:text-white mb-1">
            Embed &amp; Dedup
          </div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            Each item becomes a 1,536-dim semantic vector. New items above 0.92
            similarity to an existing card merge in as additional sources, not
            duplicates.
          </p>
        </div>
        <div className="rounded-lg p-4 bg-white/60 dark:bg-dark-surface/60">
          <div className="font-semibold text-gray-900 dark:text-white mb-1">
            Classify &amp; Score
          </div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            GPT-5.4-mini assigns pillar, maturity stage, and time horizon, then
            scores on six independent factors so analysts can sort by what
            matters today.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card anatomy — labelled mock card
// ---------------------------------------------------------------------------

function CardAnatomy() {
  type Part =
    | "title"
    | "pillar"
    | "stage"
    | "horizon"
    | "scores"
    | "summary"
    | null;
  const [hovered, setHovered] = useState<Part>(null);

  const Anno = ({
    label,
    desc,
    part,
    side = "left" as "left" | "right",
  }: {
    label: string;
    desc: string;
    part: Exclude<Part, null>;
    side?: "left" | "right";
  }) => {
    const isActive = hovered === part;
    return (
      <div
        onMouseEnter={() => setHovered(part)}
        onMouseLeave={() => setHovered(null)}
        className={cn(
          "flex items-center gap-2 text-xs cursor-pointer transition-all duration-200",
          side === "right" && "flex-row-reverse text-right",
          isActive ? "scale-[1.02]" : "opacity-90",
        )}
      >
        <div
          className={cn(
            "h-px transition-all duration-200",
            isActive ? "w-12 bg-brand-blue" : "w-6 bg-brand-blue/40",
          )}
        />
        <div>
          <div
            className={cn(
              "font-semibold transition-colors",
              isActive
                ? "text-brand-blue dark:text-brand-blue"
                : "text-gray-900 dark:text-white",
            )}
          >
            {label}
          </div>
          <div className="text-gray-500 dark:text-gray-400">{desc}</div>
        </div>
      </div>
    );
  };

  const ring = (part: Exclude<Part, null>) =>
    hovered === part
      ? "ring-2 ring-brand-blue ring-offset-2 ring-offset-white dark:ring-offset-dark-surface rounded"
      : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
      <div className="hidden lg:flex flex-col gap-6">
        <Anno
          label="Title + slug"
          desc="Stable URL across renames"
          part="title"
        />
        <Anno
          label="Strategic pillar"
          desc="One of six city priorities"
          part="pillar"
        />
        <Anno
          label="Maturity stage"
          desc="Concept → Mature → Declining"
          part="stage"
        />
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface shadow-sm p-5 transition-shadow hover:shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue transition-all",
              ring("pillar"),
            )}
          >
            Mobility
          </span>
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green transition-all",
              ring("stage"),
            )}
          >
            Pilot
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider text-gray-500 px-1 transition-all",
              ring("horizon"),
            )}
          >
            2y horizon
          </span>
        </div>
        <h3
          className={cn(
            "font-bold text-gray-900 dark:text-white mb-1 transition-all",
            ring("title"),
          )}
        >
          Autonomous shuttle pilots accelerate
        </h3>
        <p
          className={cn(
            "text-xs text-gray-600 dark:text-gray-400 mb-4 transition-all",
            ring("summary"),
          )}
        >
          Multiple municipalities are graduating low-speed AV shuttles from
          closed-loop demos to mixed-traffic pilots…
        </p>
        <div
          className={cn(
            "grid grid-cols-3 gap-2 text-[10px] transition-all p-1",
            ring("scores"),
          )}
        >
          {[
            { label: "Impact", val: 84 },
            { label: "Relevance", val: 91 },
            { label: "Velocity", val: 67 },
            { label: "Novelty", val: 58 },
            { label: "Opportunity", val: 79 },
            { label: "Risk", val: 42 },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>{s.label}</span>
                <span className="tabular-nums font-semibold text-gray-700 dark:text-gray-200">
                  {s.val}
                </span>
              </div>
              <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 mt-0.5">
                <div
                  className="h-1 rounded-full bg-brand-blue"
                  style={{ width: `${s.val}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden lg:flex flex-col gap-6">
        <Anno
          label="Six-factor score"
          desc="Impact, Relevance, Velocity, Novelty, Opportunity, Risk"
          part="scores"
          side="right"
        />
        <Anno
          label="Time horizon"
          desc="When this matters: now, 1y, 2y, 5y+"
          part="horizon"
          side="right"
        />
        <Anno
          label="Summary + sources"
          desc="Articles dedup into a single card"
          part="summary"
          side="right"
        />
      </div>
      <p className="lg:hidden text-xs text-gray-500 dark:text-gray-400 col-span-1">
        On a wider screen, hover the labels to see how each part of the card
        maps back to the underlying schema.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semantic similarity — animated cluster scatter
// ---------------------------------------------------------------------------

function ClusterScatter() {
  // Three illustrative clusters; not real data. Coords in a 600x400 canvas
  // with 40px padding so labels and glows stay inside the viewBox.
  const clusters = useMemo<
    Array<{
      color: string;
      label: string;
      labelPos: [number, number];
      points: Array<[number, number]>;
    }>
  >(
    () => [
      {
        color: "#44499C",
        label: "Mobility",
        labelPos: [140, 60],
        points: [
          [130, 130],
          [150, 150],
          [115, 155],
          [165, 135],
          [135, 175],
          [160, 115],
        ],
      },
      {
        color: "#009F4D",
        label: "Climate & Energy",
        labelPos: [445, 60],
        points: [
          [430, 105],
          [455, 125],
          [415, 140],
          [475, 115],
          [445, 165],
          [485, 145],
        ],
      },
      {
        color: "#7C4DFF",
        label: "Civic AI",
        labelPos: [285, 360],
        points: [
          [275, 270],
          [300, 290],
          [255, 295],
          [320, 265],
          [285, 320],
          [240, 275],
        ],
      },
    ],
    [],
  );

  // Highlight a single "candidate" point near the Mobility cluster — shows
  // the 0.92 similarity ring so it gets merged in as another source.
  const candidate: [number, number] = [180, 170];
  const dedupTarget: [number, number] = [150, 150];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6">
      <svg
        viewBox="0 0 600 400"
        className="w-full h-auto"
        role="img"
        aria-label="Semantic similarity cluster scatter plot"
      >
        <defs>
          <radialGradient id="clusterGlow">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        {/* Faint grid + axis labels, suggesting "vector space" */}
        <rect
          x="0"
          y="0"
          width="600"
          height="400"
          fill="url(#grid)"
          className="text-gray-400 dark:text-gray-600"
        />
        <text
          x="20"
          y="20"
          fill="currentColor"
          className="text-gray-400 dark:text-gray-500"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          dim_1
        </text>
        <text
          x="580"
          y="390"
          fill="currentColor"
          textAnchor="end"
          className="text-gray-400 dark:text-gray-500"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          dim_2 · 1,536-dim space (projected to 2D)
        </text>

        {/* Clusters */}
        {clusters.map((c) => {
          const cx = c.points.reduce((s, p) => s + p[0], 0) / c.points.length;
          const cy = c.points.reduce((s, p) => s + p[1], 0) / c.points.length;
          return (
            <g key={c.label} style={{ color: c.color }}>
              <circle cx={cx} cy={cy} r={80} fill="url(#clusterGlow)" />
              {c.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={7}
                  fill={c.color}
                  stroke="white"
                  strokeWidth="1.5"
                  className="animate-[fadeIn_600ms_ease-out_both]"
                  style={{ animationDelay: `${i * 70}ms` }}
                />
              ))}
              <text
                x={c.labelPos[0]}
                y={c.labelPos[1]}
                textAnchor="middle"
                fill={c.color}
                fontSize="14"
                fontWeight="700"
              >
                {c.label}
              </text>
            </g>
          );
        })}

        {/* Candidate / dedup demonstration */}
        <g
          className="animate-[fadeIn_600ms_ease-out_both]"
          style={{ animationDelay: "700ms" }}
        >
          <line
            x1={candidate[0]}
            y1={candidate[1]}
            x2={dedupTarget[0]}
            y2={dedupTarget[1]}
            stroke="#44499C"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.6"
          />
          <circle
            cx={candidate[0]}
            cy={candidate[1]}
            r="22"
            fill="none"
            stroke="#44499C"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.55"
          />
          <circle
            cx={candidate[0]}
            cy={candidate[1]}
            r="7"
            fill="white"
            stroke="#44499C"
            strokeWidth="2"
          />
          <text
            x={candidate[0] + 30}
            y={candidate[1] - 4}
            fill="#44499C"
            fontSize="11"
            fontWeight="600"
          >
            new article
          </text>
          <text
            x={candidate[0] + 30}
            y={candidate[1] + 10}
            fill="#44499C"
            fontSize="10"
            opacity="0.75"
          >
            cosine 0.94 → dedup
          </text>
        </g>
      </svg>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface-deep">
          <span className="h-2.5 w-2.5 rounded-full bg-[#44499C]" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Mobility
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-auto">
            ~6 cards
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface-deep">
          <span className="h-2.5 w-2.5 rounded-full bg-[#009F4D]" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Climate &amp; Energy
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-auto">
            ~6 cards
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface-deep">
          <span className="h-2.5 w-2.5 rounded-full bg-[#7C4DFF]" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Civic AI
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-auto">
            ~6 cards
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 leading-relaxed">
        Cards near each other in this 1,536-dimensional space share{" "}
        <em>meaning</em> — not just keywords. The dashed ring shows the dedup
        threshold: when a new article lands within{" "}
        <span className="font-semibold text-brand-blue">cosine 0.92</span> of an
        existing card, it gets merged in as another source instead of creating a
        duplicate.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live hybrid search demo
// ---------------------------------------------------------------------------

interface SearchHit {
  id: string;
  name: string;
  slug?: string;
  summary?: string;
  pillar_id?: string;
  search_relevance?: number;
}

function HybridSearchDemo() {
  const [query, setQuery] = useState("");
  const [textHits, setTextHits] = useState<SearchHit[]>([]);
  const [vectorHits, setVectorHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setTextHits([]);
    setVectorHits([]);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const STOPWORDS = new Set([
        "the",
        "and",
        "for",
        "with",
        "from",
        "into",
        "about",
        "this",
        "that",
        "are",
        "was",
        "were",
        "but",
        "not",
        "you",
        "your",
        "have",
        "has",
        "will",
        "can",
        "all",
        "any",
        "how",
        "what",
        "when",
        "where",
        "why",
        "who",
      ]);
      const tokens = q
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
      // Backend's text mode does `ilike %query%` against name/summary, so a
      // multi-word phrase rarely matches. Tokenize and run one search per
      // significant word, then dedupe & rank by hit-count for the demo.
      const keywordTokens = tokens.length > 0 ? tokens : [q];
      const body = (queryStr: string, vector: boolean) =>
        JSON.stringify({
          query: queryStr,
          use_vector_search: vector,
          limit: 5,
          offset: 0,
        });
      const parse = async (r: Response): Promise<SearchHit[]> => {
        if (!r.ok) return [];
        const data = await r.json();
        const arr = Array.isArray(data) ? data : data?.results;
        return Array.isArray(arr) ? arr.slice(0, 10) : [];
      };
      const keywordPromise = Promise.all(
        keywordTokens.map((tok) =>
          fetch(`${API_BASE_URL}/api/v1/cards/search`, {
            method: "POST",
            headers,
            body: body(tok, false),
          }).then(parse),
        ),
      ).then((batches) => {
        const counts: Record<
          string,
          { hit: SearchHit; count: number; firstRank: number }
        > = {};
        batches.forEach((batch) => {
          batch.forEach((h, i) => {
            const existing = counts[h.id];
            if (existing) {
              existing.count += 1;
              existing.firstRank = Math.min(existing.firstRank, i);
            } else {
              counts[h.id] = { hit: h, count: 1, firstRank: i };
            }
          });
        });
        return Object.values(counts)
          .sort((a, b) => b.count - a.count || a.firstRank - b.firstRank)
          .slice(0, 5)
          .map((x) => x.hit);
      });
      const vectorPromise = fetch(`${API_BASE_URL}/api/v1/cards/search`, {
        method: "POST",
        headers,
        body: body(q, true),
      }).then(parse);
      const [t, v] = await Promise.all([keywordPromise, vectorPromise]);
      setTextHits(t);
      setVectorHits(v.slice(0, 5));
      if (!t.length && !v.length) setError("No results — try a broader query.");
    } catch {
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Simulated RRF fusion for visualization
  const fused = useMemo(() => {
    const rrf: Record<string, { hit: SearchHit; score: number }> = {};
    const k = 60;
    textHits.forEach((h, i) => {
      rrf[h.id] = { hit: h, score: 1 / (k + i + 1) };
    });
    vectorHits.forEach((h, i) => {
      const add = 1 / (k + i + 1);
      const existing = rrf[h.id];
      if (existing) existing.score += add;
      else rrf[h.id] = { hit: h, score: add };
    });
    return Object.values(rrf)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.hit);
  }, [textHits, vectorHits]);

  const Hit = ({ hit }: { hit: SearchHit }) => (
    <Link
      to={hit.slug ? `/signals/${hit.slug}` : `/signals`}
      className="block rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:border-brand-blue transition-colors bg-white dark:bg-dark-surface text-xs"
    >
      <div className="font-semibold text-gray-900 dark:text-white line-clamp-2">
        {hit.name}
      </div>
      {hit.summary && (
        <div className="text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
          {hit.summary}
        </div>
      )}
    </Link>
  );

  const exampleQueries = [
    "Austin housing affordability",
    "extreme heat resilience",
    "I-35 corridor mobility",
    "AI in city services",
  ];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6 md:p-8">
      <form onSubmit={runSearch} className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try a query — e.g. 'Austin housing affordability'"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface-deep text-gray-900 dark:text-white text-sm focus:outline-none focus:border-brand-blue"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching…" : "Run hybrid search"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2 mb-6">
        {exampleQueries.map((q) => (
          <button
            key={q}
            onClick={() => {
              setQuery(q);
              setTimeout(() => runSearch(), 0);
            }}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-blue hover:text-brand-blue transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm text-amber-700 dark:text-amber-400 mb-4">
          {error}
        </div>
      )}

      {searched && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Keyword (FTS)
              </span>
              <span className="text-[10px] text-gray-400">
                {textHits.length}
              </span>
            </div>
            <div className="space-y-2">
              {loading
                ? [0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg bg-gray-100 dark:bg-dark-surface-deep animate-pulse"
                    />
                  ))
                : textHits.map((h) => <Hit key={h.id} hit={h} />)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-blue">
                Semantic (vector)
              </span>
              <span className="text-[10px] text-gray-400">
                {vectorHits.length}
              </span>
            </div>
            <div className="space-y-2">
              {loading
                ? [0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg bg-brand-blue/10 animate-pulse"
                    />
                  ))
                : vectorHits.map((h) => <Hit key={h.id} hit={h} />)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-green">
                Fused (RRF)
              </span>
              <span className="text-[10px] text-gray-400">{fused.length}</span>
            </div>
            <div className="space-y-2">
              {loading
                ? [0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg bg-brand-green/10 animate-pulse"
                    />
                  ))
                : fused.map((h) => <Hit key={h.id} hit={h} />)}
            </div>
          </div>
        </div>
      )}
      {!searched && (
        <div className="rounded-lg p-6 bg-gray-50 dark:bg-dark-surface-deep text-sm text-gray-600 dark:text-gray-400 text-center">
          Run a search to see keyword matches, semantic matches, and the fused
          ranking side-by-side.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pattern detection illustration
// ---------------------------------------------------------------------------

function PatternIllustration() {
  const { ref, visible } = useReveal<HTMLDivElement>(0.3);
  return (
    <div
      ref={ref}
      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6 md:p-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
        <div className="md:col-span-3 space-y-2">
          {[
            "Rural EV charging gap",
            "Battery recycling startup launches",
            "TxDOT grant program for fleets",
          ].map((t, i) => (
            <div
              key={t}
              className={cn(
                "rounded-lg p-3 bg-gray-50 dark:bg-dark-surface-deep border border-gray-200 dark:border-gray-700 text-xs transition-all duration-700 ease-out",
                visible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-6",
              )}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <div className="text-[10px] uppercase tracking-wider text-brand-blue font-semibold mb-0.5">
                Weak signal
              </div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {t}
              </div>
            </div>
          ))}
        </div>
        <div className="md:col-span-1 flex items-center justify-center">
          <div
            className={cn(
              "hidden md:flex flex-col items-center text-brand-blue transition-all duration-700",
              visible ? "opacity-100 scale-100" : "opacity-0 scale-50",
            )}
            style={{ transitionDelay: "500ms" }}
          >
            <Network className="h-8 w-8 animate-pulse" />
            <span className="text-[10px] mt-1 uppercase tracking-wider">
              Cluster
            </span>
          </div>
          <div className="md:hidden flex items-center text-brand-blue">
            <ArrowRight className="h-6 w-6 rotate-90" />
          </div>
        </div>
        <div
          className={cn(
            "md:col-span-3 rounded-xl p-4 bg-gradient-to-br from-brand-blue/10 to-brand-green/10 border border-brand-blue/20 transition-all duration-700 ease-out",
            visible
              ? "opacity-100 translate-x-0 scale-100"
              : "opacity-0 translate-x-6 scale-95",
          )}
          style={{ transitionDelay: "700ms" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-4 w-4 text-brand-blue" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-blue">
              Pattern
            </span>
          </div>
          <div className="font-bold text-sm text-gray-900 dark:text-white mb-1">
            Statewide EV transition is bottlenecked at the regional grid
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Three independent signals across mobility, environment, and economy
            point to the same chokepoint — a pattern no single article would
            surface alone.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
              Notable
            </span>
            <span className="text-[10px] text-gray-500">Confidence 0.78</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat agent — tool catalog
// ---------------------------------------------------------------------------

function ChatAgentTools() {
  const tools = [
    {
      icon: Globe,
      name: "web_search",
      desc: "Live web search via Tavily for breaking developments",
      kind: "Read",
    },
    {
      icon: Radio,
      name: "get_card_details",
      desc: "Fetch a signal's full content, sources, and scores by slug",
      kind: "Read",
    },
    {
      icon: Search,
      name: "search_signals",
      desc: "Hybrid search across the library — defaults to current scope, can override",
      kind: "Read",
    },
    {
      icon: Compass,
      name: "list_workstreams",
      desc: "Show the user's research streams with progress",
      kind: "Read",
    },
    {
      icon: Layers,
      name: "get_workstream",
      desc: "Open a workstream's cards and kanban state",
      kind: "Read",
    },
    {
      icon: Brain,
      name: "list_patterns",
      desc: "Surface AI-detected cross-signal patterns",
      kind: "Read",
    },
    {
      icon: Bookmark,
      name: "follow_signal",
      desc: "Subscribe the user to updates on a signal",
      kind: "Write",
    },
    {
      icon: Bookmark,
      name: "unfollow_signal",
      desc: "Reverse a follow",
      kind: "Write",
    },
    {
      icon: Pin,
      name: "pin_signal",
      desc: "Pin a signal to the user's prioritized list",
      kind: "Write",
    },
    {
      icon: Pin,
      name: "unpin_signal",
      desc: "Reverse a pin",
      kind: "Write",
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {tools.map((t) => {
        const Icon = t.icon;
        const isWrite = t.kind === "Write";
        return (
          <div
            key={t.name}
            className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4"
          >
            <div
              className={cn(
                "p-2 rounded-lg shrink-0",
                isWrite
                  ? "bg-brand-green/10 text-brand-green"
                  : "bg-brand-blue/10 text-brand-blue",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t.name}
                </code>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider",
                    isWrite
                      ? "bg-brand-green/10 text-brand-green"
                      : "bg-gray-100 dark:bg-dark-surface-deep text-gray-600 dark:text-gray-400",
                  )}
                >
                  {t.kind}
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                {t.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brief / research illustration
// ---------------------------------------------------------------------------

function BriefIllustration() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[
        {
          icon: Wand2,
          title: "Question",
          desc: "An analyst asks a strategic question on a signal or workstream.",
          accent: "bg-brand-blue/10 text-brand-blue",
        },
        {
          icon: BookOpen,
          title: "Deep research",
          desc: "gpt-researcher orchestrates focused web research, collects citations, drafts a structured brief.",
          accent: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
        },
        {
          icon: FileText,
          title: "Polished export",
          desc: "Gamma generates a branded PowerPoint with AI-generated images and consistent themes — ready for the executive read-out.",
          accent: "bg-brand-green/10 text-brand-green",
        },
      ].map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.title}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-5"
          >
            <div className={cn("p-2 rounded-lg w-fit mb-3", s.accent)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="font-bold text-gray-900 dark:text-white mb-1">
              {s.title}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {s.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workstream illustration
// ---------------------------------------------------------------------------

function WorkstreamIllustration() {
  const lanes = [
    { title: "Inbox", count: 8, color: "bg-gray-300" },
    { title: "Investigating", count: 3, color: "bg-brand-blue" },
    { title: "Briefing", count: 2, color: "bg-amber-500" },
    { title: "Done", count: 5, color: "bg-brand-green" },
  ];
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {lanes.map((l) => (
          <div
            key={l.title}
            className="rounded-xl bg-gray-50 dark:bg-dark-surface-deep p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {l.title}
              </div>
              <span className={cn("h-2 w-2 rounded-full", l.color)} />
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: Math.min(l.count, 3) }).map((_, i) => (
                <div
                  key={i}
                  className="h-6 rounded-md bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700"
                />
              ))}
              {l.count > 3 && (
                <div className="text-[10px] text-gray-500 text-center pt-0.5">
                  +{l.count - 3} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-5 leading-relaxed">
        Workstreams are how analysts <em>own</em> a topic. Drag signals through
        investigation lanes, attach research, generate briefs — and next time
        the discovery pipeline finds something relevant, it lands right in the
        workstream's queue.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const ANCHOR_NAV: AnchorItem[] = [
  { id: "discovery", label: "Discovery" },
  { id: "cards", label: "Cards" },
  { id: "similarity", label: "Similarity" },
  { id: "search", label: "Hybrid search" },
  { id: "patterns", label: "Patterns" },
  { id: "chat", label: "Chat agent" },
  { id: "briefs", label: "Briefs" },
  { id: "workstreams", label: "Workstreams" },
];

function WhatWeDontClaim() {
  const items = [
    "Not a forecasting model. Foresight surfaces and structures signals — humans decide what they mean.",
    "Not real-time below ~5 minutes. The discovery worker is on a steady cadence, not a millisecond firehose.",
    "Deduplication is conservative. Two cards on near-identical topics can occasionally coexist; analysts can merge them.",
    "Citations come from public sources. We don't ingest paywalled content unless the city has a license.",
    "The chat agent's writes are reversible (follow / pin / unpin) — it never deletes, never publishes externally.",
  ];
  return (
    <section className="py-16 md:py-20 bg-gray-50 dark:bg-dark-surface-deep border-t border-gray-200 dark:border-gray-700">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Honest limits
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6">
          What Foresight isn't.
        </h2>
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it}
              className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
            >
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <div className="bg-brand-faded-white dark:bg-brand-dark-blue min-h-screen">
      <ScrollProgressBar />
      <StickyAnchorNav items={ANCHOR_NAV} />
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-blue via-brand-blue/95 to-brand-green text-white">
        <div className="absolute inset-0 opacity-20">
          <svg
            viewBox="0 0 800 400"
            className="w-full h-full"
            aria-hidden="true"
          >
            {Array.from({ length: 40 }).map((_, i) => {
              const cx = (i * 73) % 800;
              const cy = (i * 41) % 400;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={2}
                  fill="white"
                  opacity={0.6}
                />
              );
            })}
            {Array.from({ length: 30 }).map((_, i) => {
              const x1 = (i * 73) % 800;
              const y1 = (i * 41) % 400;
              const x2 = ((i + 1) * 73) % 800;
              const y2 = ((i + 1) * 41) % 400;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="white"
                  strokeOpacity={0.15}
                />
              );
            })}
          </svg>
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
              Behind the scenes
            </span>
            <SpeedMetric />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 max-w-4xl leading-tight">
            How Foresight finds tomorrow's questions today.
          </h1>
          <p className="text-lg md:text-xl text-white/85 max-w-3xl leading-relaxed">
            A guided tour of every system that turns the firehose of public
            information into the strategic signals, patterns, and briefs
            powering Austin's planning. Live demos included.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#discovery"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-brand-blue font-semibold text-sm hover:bg-white/90 transition-colors"
            >
              Start the tour
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/ask"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              Try the chat agent
              <Sparkles className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <StatStrip />

      {/* Sections */}
      <Section
        id="discovery"
        eyebrow="Step 1"
        title="The discovery pipeline runs continuously."
        intro="Foresight pulls in thousands of new items every week from RSS feeds, NewsAPI, and curated municipal sources. Every item is triaged, embedded, classified, and scored — automatically — so analysts never start from a blank page."
        icon={<Compass className="h-4 w-4" />}
        techNote="Stack: Python worker process, OpenAI embeddings (text-embedding-ada-002, 1536 dims), GPT-5.4-mini for classification & scoring, pgvector for similarity, Supabase Postgres for storage. Triage drops ~70% of items before any LLM cost."
      >
        <PipelineDiagram />
      </Section>

      <Section
        id="cards"
        eyebrow="Step 2"
        title="Cards are atomic intelligence units."
        intro="Each card represents a single trend, technology, or issue — with one URL, one slug, and a versioned history. Multiple articles dedup into the same card so the team tracks the topic, not the news cycle."
        icon={<Radio className="h-4 w-4" />}
        alternate
      >
        <CardAnatomy />
      </Section>

      <Section
        id="similarity"
        eyebrow="Step 3"
        title="Semantic similarity, not keyword matching."
        intro="Every card lives in a 1,536-dimensional vector space. Topics that mean the same thing land near each other — even when they share no words. New items above a 0.92 similarity threshold merge into the existing card as additional sources."
        icon={<Network className="h-4 w-4" />}
        techNote="pgvector ivfflat index on a 1536-dim embedding column. Similarity uses cosine distance. The 0.92 dedup threshold was tuned against a labeled set of municipal-tech articles to balance precision (don't merge unrelated topics) and recall (don't fragment one trend across five cards)."
      >
        <ClusterScatter />
      </Section>

      <Section
        id="search"
        eyebrow="Step 4 — Live demo"
        title="Hybrid search: keyword and meaning, fused."
        intro="Pure keyword search misses paraphrases. Pure semantic search drifts off-topic. Foresight runs both in parallel and fuses them with Reciprocal Rank Fusion — then an LLM reranker picks the final order. Try a query and watch all three rankings appear side by side."
        icon={<Search className="h-4 w-4" />}
        alternate
        techNote="Postgres tsvector full-text search + pgvector cosine similarity. RRF score: Σ 1/(k + rank), k=60. Top fused results are then reranked by GPT-5.4-mini against the user's intent before being passed to GPT-5.5 for synthesis."
      >
        <HybridSearchDemo />
      </Section>

      <Section
        id="patterns"
        eyebrow="Step 5"
        title="Patterns: what weak signals add up to."
        intro="The most valuable insights aren't in any single article. They're in the convergence of three or four. A scheduled job clusters cards across pillars, asks GPT-5.5 to find the cross-cutting story, and writes it back as a pattern card with an opportunity statement."
        icon={<Brain className="h-4 w-4" />}
      >
        <PatternIllustration />
      </Section>

      <Section
        id="chat"
        eyebrow="Step 6"
        title="The chat agent has tools — and uses them."
        intro="Ask Foresight isn't a wrapper around a chatbot. It's a tool-using agent backed by GPT-5.5 (via the OpenAI Responses API) with hybrid-search retrieval, citations from the library, and a curated set of read and write tools. It defaults to your current scope (signal, workstream, or global) but can broaden when you ask."
        icon={<MessageSquare className="h-4 w-4" />}
        alternate
        techNote="System prompt enforces citation discipline; per-message budget caps tool calls (8) and web searches (2) to keep latency in check. Write tools (follow / pin) are reversible by design — the agent never takes destructive actions."
      >
        <ChatAgentTools />
      </Section>

      <Section
        id="briefs"
        eyebrow="Step 7"
        title="From question to executive-ready brief."
        intro="When a signal warrants deeper investigation, Foresight orchestrates a focused research run, drafts a structured brief, then renders a polished PowerPoint with AI-generated imagery — all from a single click."
        icon={<FileText className="h-4 w-4" />}
      >
        <BriefIllustration />
      </Section>

      <Section
        id="workstreams"
        eyebrow="Step 8"
        title="Workstreams close the loop."
        intro="Discovery without ownership is just noise. Workstreams turn signals into projects — kanban-tracked, briefable, and connected back to the discovery pipeline so the system knows what each analyst cares about."
        icon={<Layers className="h-4 w-4" />}
        alternate
      >
        <WorkstreamIllustration />
      </Section>

      <WhatWeDontClaim />

      {/* CTA */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-brand-blue via-brand-blue/90 to-brand-green text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Zap className="h-10 w-10 mx-auto mb-4" />
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Now go try it.
          </h2>
          <p className="text-lg text-white/85 max-w-2xl mx-auto mb-8 leading-relaxed">
            Every system above is wired up and live in this app. Pick a starting
            point — the rest reveals itself.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/ask"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-brand-blue font-semibold text-sm hover:bg-white/90 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Ask Foresight
            </Link>
            <Link
              to="/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              <Compass className="h-4 w-4" />
              Open Discover
            </Link>
            <Link
              to="/signals"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              <Radio className="h-4 w-4" />
              Browse Signals
            </Link>
            <Link
              to="/patterns"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              <Brain className="h-4 w-4" />
              See Patterns
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm text-white/70">
            <CheckCircle className="h-4 w-4" />
            <span>
              Built for the City of Austin's strategic horizon-scanning team.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
