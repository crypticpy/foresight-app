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
import { supabase } from "../App";
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
    <div className="mt-6 max-w-3xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-brand-blue dark:text-gray-400 dark:hover:text-brand-blue transition-colors"
      >
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
        Under the hood
      </button>
      {open && (
        <div className="mt-3 p-4 rounded-lg bg-gray-100 dark:bg-dark-surface-deep border-l-2 border-brand-blue text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-mono">
          {children}
        </div>
      )}
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
    },
    {
      label: "Active this month",
      value: stats?.cards_this_month,
      icon: TrendingUp,
    },
    {
      label: "New this week",
      value: stats?.cards_this_week,
      icon: Sparkles,
    },
    {
      label: "Patterns detected",
      value: patternCount,
      icon: Brain,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 md:p-6">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.label}
              className="flex flex-col items-start p-3 rounded-xl bg-gray-50 dark:bg-dark-surface-deep"
            >
              <Icon className="h-4 w-4 text-brand-blue mb-2" />
              <div className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                {it.value === null || it.value === undefined ? (
                  <span className="text-gray-300 dark:text-gray-600">—</span>
                ) : (
                  it.value.toLocaleString()
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {it.label}
              </div>
            </div>
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
  return (
    <div className="relative bg-gradient-to-br from-brand-blue/5 via-transparent to-brand-green/5 dark:from-brand-blue/10 dark:to-brand-green/10 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 md:p-10 overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-2 relative z-10">
        {stages.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex flex-col items-center text-center"
            >
              <div
                className="relative h-14 w-14 md:h-16 md:w-16 rounded-2xl flex items-center justify-center bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700 shadow-sm"
                style={{ animationDelay: `${i * 200}ms` }}
              >
                <Icon className="h-6 w-6 text-brand-blue" />
                <span className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-brand-blue text-white text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </div>
              <div className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
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
            GPT-4 assigns pillar, maturity stage, and time horizon, then scores
            on six independent factors so analysts can sort by what matters
            today.
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
  const Anno = ({
    label,
    desc,
    side = "left" as "left" | "right",
  }: {
    label: string;
    desc: string;
    side?: "left" | "right";
  }) => (
    <div
      className={cn(
        "flex items-center gap-2 text-xs",
        side === "right" && "flex-row-reverse text-right",
      )}
    >
      <div className="h-px w-6 bg-brand-blue/40" />
      <div>
        <div className="font-semibold text-gray-900 dark:text-white">
          {label}
        </div>
        <div className="text-gray-500 dark:text-gray-400">{desc}</div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
      <div className="hidden lg:flex flex-col gap-6">
        <Anno label="Title + slug" desc="Stable URL across renames" />
        <Anno label="Strategic pillar" desc="One of six city priorities" />
        <Anno label="Maturity stage" desc="Concept → Mature → Declining" />
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface shadow-sm p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
            Mobility
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green">
            Pilot
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            2y horizon
          </span>
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white mb-1">
          Autonomous shuttle pilots accelerate
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
          Multiple municipalities are graduating low-speed AV shuttles from
          closed-loop demos to mixed-traffic pilots…
        </p>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
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
          side="right"
        />
        <Anno
          label="Time horizon"
          desc="When this matters: now, 1y, 2y, 5y+"
          side="right"
        />
        <Anno
          label="Sources roll up"
          desc="Articles dedup into a single card"
          side="right"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semantic similarity — animated cluster scatter
// ---------------------------------------------------------------------------

function ClusterScatter() {
  // Three illustrative clusters; not real data
  const clusters = useMemo<
    Array<{ color: string; label: string; points: Array<[number, number]> }>
  >(
    () => [
      {
        color: "#44499C",
        label: "Mobility",
        points: [
          [120, 110],
          [135, 130],
          [110, 140],
          [150, 120],
          [125, 155],
          [142, 100],
        ],
      },
      {
        color: "#009F4D",
        label: "Climate",
        points: [
          [320, 90],
          [340, 110],
          [310, 130],
          [355, 95],
          [330, 145],
          [365, 130],
        ],
      },
      {
        color: "#7C4DFF",
        label: "Civic AI",
        points: [
          [220, 220],
          [240, 235],
          [205, 240],
          [255, 215],
          [230, 260],
          [195, 215],
        ],
      },
    ],
    [],
  );

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6">
      <svg viewBox="0 0 480 320" className="w-full h-auto">
        <defs>
          <radialGradient id="clusterGlow">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        {clusters.map((c) => {
          const cx = c.points.reduce((s, p) => s + p[0], 0) / c.points.length;
          const cy = c.points.reduce((s, p) => s + p[1], 0) / c.points.length;
          return (
            <g key={c.label} style={{ color: c.color }}>
              <circle cx={cx} cy={cy} r={70} fill="url(#clusterGlow)" />
              {c.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={6}
                  fill={c.color}
                  className="animate-[fadeIn_600ms_ease-out_both]"
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
              <text
                x={cx}
                y={cy + 95}
                textAnchor="middle"
                fill={c.color}
                className="text-[12px] font-semibold"
              >
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 leading-relaxed">
        Cards near each other in this 1,536-dimensional space share meaning —
        not just keywords. That's why an article about{" "}
        <em>"low-speed shuttles"</em> dedups with one about{" "}
        <em>"autonomous transit pilots"</em> even though no words overlap.
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
      const body = (vector: boolean) =>
        JSON.stringify({
          query: q,
          use_vector_search: vector,
          limit: 5,
          offset: 0,
        });
      const [textRes, vecRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/cards/search`, {
          method: "POST",
          headers,
          body: body(false),
        }),
        fetch(`${API_BASE_URL}/api/v1/cards/search`, {
          method: "POST",
          headers,
          body: body(true),
        }),
      ]);
      const parse = async (r: Response): Promise<SearchHit[]> => {
        if (!r.ok) return [];
        const data = await r.json();
        const arr = Array.isArray(data) ? data : data?.results;
        return Array.isArray(arr) ? arr.slice(0, 5) : [];
      };
      const [t, v] = await Promise.all([parse(textRes), parse(vecRes)]);
      setTextHits(t);
      setVectorHits(v);
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
    "autonomous vehicles",
    "housing affordability",
    "climate resilience",
    "AI in government",
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
            placeholder="Try a query — e.g. 'autonomous vehicles'"
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
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6 md:p-8">
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
        <div className="md:col-span-3 space-y-2">
          {[
            "Rural EV charging gap",
            "Battery recycling startup launches",
            "TxDOT grant program for fleets",
          ].map((t) => (
            <div
              key={t}
              className="rounded-lg p-3 bg-gray-50 dark:bg-dark-surface-deep border border-gray-200 dark:border-gray-700 text-xs"
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
          <div className="hidden md:flex flex-col items-center text-brand-blue">
            <Network className="h-8 w-8 animate-pulse" />
            <span className="text-[10px] mt-1 uppercase tracking-wider">
              Cluster
            </span>
          </div>
          <div className="md:hidden flex items-center text-brand-blue">
            <ArrowRight className="h-6 w-6 rotate-90" />
          </div>
        </div>
        <div className="md:col-span-3 rounded-xl p-4 bg-gradient-to-br from-brand-blue/10 to-brand-green/10 border border-brand-blue/20">
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

export default function HowItWorks() {
  return (
    <div className="bg-brand-faded-white dark:bg-brand-dark-blue min-h-screen">
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
        techNote="Stack: Python worker process, Azure OpenAI embeddings (text-embedding-ada-002, 1536 dims), GPT-4 for classification & scoring, pgvector for similarity, Supabase Postgres for storage. Triage drops ~70% of items before any LLM cost."
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
        techNote="Postgres tsvector full-text search + pgvector cosine similarity. RRF score: Σ 1/(k + rank), k=60. Top fused results are then reranked by GPT-4.1-mini against the user's intent before being passed to the answering model."
      >
        <HybridSearchDemo />
      </Section>

      <Section
        id="patterns"
        eyebrow="Step 5"
        title="Patterns: what weak signals add up to."
        intro="The most valuable insights aren't in any single article. They're in the convergence of three or four. A scheduled job clusters cards across pillars, asks GPT-4 to find the cross-cutting story, and writes it back as a pattern card with an opportunity statement."
        icon={<Brain className="h-4 w-4" />}
      >
        <PatternIllustration />
      </Section>

      <Section
        id="chat"
        eyebrow="Step 6"
        title="The chat agent has tools — and uses them."
        intro="Ask Foresight isn't a wrapper around a chatbot. It's a tool-using agent backed by GPT-4.1 with hybrid-search retrieval, citations from the library, and a curated set of read and write tools. It defaults to your current scope (signal, workstream, or global) but can broaden when you ask."
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
