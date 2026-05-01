import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, Filter } from "lucide-react";
import { supabase } from "../App";
import { cn } from "../lib/utils";
import { API_BASE_URL } from "../lib/config";
import { PillarBadge } from "../components/PillarBadge";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatternInsight {
  id: string;
  pattern_title: string;
  pattern_summary: string;
  opportunity?: string | null;
  confidence: number;
  affected_pillars: string[];
  urgency: "high" | "medium" | "low";
  related_card_ids: string[];
  status: "active" | "dismissed" | "acted_on";
  created_at: string;
}

type StatusTab = "active" | "acted_on" | "dismissed";
type SortOption = "newest" | "confidence" | "urgency";

const urgencyConfig: Record<
  PatternInsight["urgency"],
  { label: string; classes: string; rank: number }
> = {
  high: {
    label: "Urgent",
    classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    rank: 3,
  },
  medium: {
    label: "Notable",
    classes:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    rank: 2,
  },
  low: {
    label: "Emerging",
    classes:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rank: 1,
  },
};

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "acted_on", label: "Acted on" },
  { key: "dismissed", label: "Dismissed" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Patterns() {
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [sort, setSort] = useState<SortOption>("newest");
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("You must be signed in to view patterns.");
        return;
      }
      const res = await fetch(
        `${API_BASE_URL}/api/v1/pattern-insights?status=${statusTab}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) {
        setError("Failed to load patterns.");
        return;
      }
      const data: PatternInsight[] = await res.json();
      setInsights(data);
    } catch {
      setError("Failed to load patterns.");
    } finally {
      setLoading(false);
    }
  }, [statusTab]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  // Pillars present across the loaded set, for the pill filter row
  const availablePillars = useMemo(() => {
    const set = new Set<string>();
    for (const i of insights) for (const p of i.affected_pillars) set.add(p);
    return Array.from(set).sort();
  }, [insights]);

  const visibleInsights = useMemo(() => {
    let list = insights;
    if (pillarFilter) {
      list = list.filter((i) => i.affected_pillars.includes(pillarFilter));
    }
    if (sort === "newest") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else if (sort === "confidence") {
      list = [...list].sort((a, b) => b.confidence - a.confidence);
    } else {
      list = [...list].sort(
        (a, b) => urgencyConfig[b.urgency].rank - urgencyConfig[a.urgency].rank,
      );
    }
    return list;
  }, [insights, pillarFilter, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-blue via-brand-blue/90 to-brand-green mb-8 p-8 md:p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-6 w-6 text-white" />
            <span className="text-xs font-medium uppercase tracking-wider text-white/80">
              Cross-signal intelligence
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            AI-Detected Patterns
          </h1>
          <p className="text-white/80 max-w-2xl">
            Patterns surface convergent themes across your signals — what
            multiple weak indicators add up to, and what strategic opportunity
            sits behind them.
          </p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setStatusTab(tab.key);
              setPillarFilter(null);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              statusTab === tab.key
                ? "border-brand-blue text-brand-blue"
                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
            )}
          >
            {tab.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-3">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Sort
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface px-2 py-1 text-gray-900 dark:text-white"
          >
            <option value="newest">Newest</option>
            <option value="confidence">Highest confidence</option>
            <option value="urgency">Most urgent</option>
          </select>
        </div>
      </div>

      {/* Pillar filter chips */}
      {availablePillars.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Filter className="h-4 w-4 text-gray-400" />
          <button
            onClick={() => setPillarFilter(null)}
            className={cn(
              "text-xs px-3 py-1 rounded-full border transition-colors",
              pillarFilter === null
                ? "bg-brand-blue text-white border-brand-blue"
                : "bg-white dark:bg-dark-surface border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-brand-blue",
            )}
          >
            All pillars
          </button>
          {availablePillars.map((pillar) => (
            <button
              key={pillar}
              onClick={() =>
                setPillarFilter(pillarFilter === pillar ? null : pillar)
              }
              className={cn(
                "rounded-full transition-opacity",
                pillarFilter && pillarFilter !== pillar
                  ? "opacity-50"
                  : "opacity-100",
              )}
            >
              <PillarBadge pillarId={pillar} size="sm" />
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse h-48"
            />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : visibleInsights.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-dark-surface rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <Sparkles className="mx-auto h-10 w-10 text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {statusTab === "active"
              ? "No active patterns yet"
              : statusTab === "acted_on"
                ? "Nothing marked as acted on"
                : "Nothing dismissed"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            {statusTab === "active"
              ? "Cross-signal patterns emerge as your intelligence library grows."
              : "Patterns you triage will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleInsights.map((insight) => (
            <PatternCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function PatternCard({ insight }: { insight: PatternInsight }) {
  const urgency = urgencyConfig[insight.urgency] ?? urgencyConfig.low;
  return (
    <Link
      to={`/patterns/${insight.id}`}
      className="block bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2">
        {insight.pattern_title}
      </h3>
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 mt-1.5">
        {insight.pattern_summary}
      </p>
      {insight.affected_pillars.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {insight.affected_pillars.map((pillar) => (
            <PillarBadge
              key={pillar}
              pillarId={pillar}
              size="sm"
              showIcon={false}
            />
          ))}
        </div>
      )}
      <div className="mt-3">
        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
          Confidence
        </span>
        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 mt-0.5">
          <div
            className="h-1.5 rounded-full bg-brand-blue"
            style={{ width: `${insight.confidence * 100}%` }}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full",
            urgency.classes,
          )}
        >
          {urgency.label}
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {formatDistanceToNow(new Date(insight.created_at), {
            addSuffix: true,
          })}
        </span>
        <span className="text-xs text-brand-blue flex items-center gap-0.5">
          Open
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
