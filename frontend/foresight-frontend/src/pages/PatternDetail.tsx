import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { API_BASE_URL } from "../lib/config";
import { PillarBadge } from "../components/PillarBadge";
import { HorizonBadge } from "../components/HorizonBadge";
import { StageBadge } from "../components/StageBadge";
import { QualityScoreBadge } from "../components/QualityScoreBadge";
import { parseStageNumber } from "../lib/stage-utils";
import type { Horizon } from "../types/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RelatedCard {
  id: string;
  name: string;
  slug: string;
  summary: string;
  pillar_id: string;
  stage_id: string;
  horizon: Horizon;
  novelty_score: number;
  maturity_score: number;
  impact_score: number;
  relevance_score: number;
  velocity_score: number;
  signal_quality_score: number | null;
  updated_at: string;
}

interface PatternInsightDetail {
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
  related_cards: RelatedCard[];
}

const urgencyConfig: Record<
  PatternInsightDetail["urgency"],
  { label: string; classes: string }
> = {
  high: {
    label: "Urgent",
    classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  medium: {
    label: "Notable",
    classes:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  low: {
    label: "Emerging",
    classes:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
};

const statusConfig: Record<
  PatternInsightDetail["status"],
  { label: string; classes: string }
> = {
  active: {
    label: "Active",
    classes:
      "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-blue-300",
  },
  acted_on: {
    label: "Acted on",
    classes:
      "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-green-300",
  },
  dismissed: {
    label: "Dismissed",
    classes: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PatternDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [insight, setInsight] = useState<PatternInsightDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadInsight = useCallback(async () => {
    if (!id) return;
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
      const res = await fetch(`${API_BASE_URL}/api/v1/pattern-insights/${id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setError("This pattern no longer exists.");
        } else {
          setError("Failed to load pattern.");
        }
        return;
      }
      const data: PatternInsightDetail = await res.json();
      setInsight(data);
    } catch {
      setError("Failed to load pattern.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInsight();
  }, [loadInsight]);

  const updateStatus = useCallback(
    async (newStatus: "dismissed" | "acted_on") => {
      if (!insight || updatingStatus) return;
      setUpdatingStatus(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(
          `${API_BASE_URL}/api/v1/pattern-insights/${insight.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: newStatus }),
          },
        );
        if (res.ok) {
          navigate("/patterns");
        }
      } finally {
        setUpdatingStatus(false);
      }
    },
    [insight, updatingStatus, navigate],
  );

  // -------------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
        <div className="h-10 w-2/3 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {error || "Pattern not found"}
        </h2>
        <Link
          to="/patterns"
          className="inline-flex items-center gap-2 text-brand-blue hover:underline mt-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to patterns
        </Link>
      </div>
    );
  }

  const urgency = urgencyConfig[insight.urgency] ?? urgencyConfig.low;
  const statusBadge = statusConfig[insight.status] ?? statusConfig.active;
  const detectedAt = new Date(insight.created_at);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        to="/patterns"
        className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-brand-blue dark:hover:text-brand-blue mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        All patterns
      </Link>

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-brand-blue" />
          <span className="text-xs font-medium uppercase tracking-wider text-brand-blue">
            AI-detected pattern
          </span>
          <span
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full",
              urgency.classes,
            )}
          >
            {urgency.label}
          </span>
          {insight.status !== "active" && (
            <span
              className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full",
                statusBadge.classes,
              )}
            >
              {statusBadge.label}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          {insight.pattern_title}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span>
            Detected {formatDistanceToNow(detectedAt, { addSuffix: true })}
          </span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-2">
            Confidence
            <span className="inline-block w-24 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden align-middle">
              <span
                className="block h-full bg-brand-blue"
                style={{ width: `${insight.confidence * 100}%` }}
              />
            </span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {Math.round(insight.confidence * 100)}%
            </span>
          </span>
        </div>

        {insight.affected_pillars.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {insight.affected_pillars.map((pillar) => (
              <PillarBadge key={pillar} pillarId={pillar} size="sm" />
            ))}
          </div>
        )}
      </header>

      {/* Body: summary + opportunity */}
      <section
        className={cn(
          "grid gap-6 mb-10",
          insight.opportunity ? "lg:grid-cols-2" : "lg:grid-cols-1",
        )}
      >
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Pattern summary
          </h2>
          <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
            {insight.pattern_summary}
          </p>
        </div>

        {insight.opportunity && (
          <div className="bg-brand-blue/5 dark:bg-brand-blue/10 border border-brand-blue/20 rounded-xl p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-blue mb-3">
              Strategic opportunity
            </h2>
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
              {insight.opportunity}
            </p>
          </div>
        )}
      </section>

      {/* Constituent signals */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Signals that triggered this pattern ({insight.related_cards.length})
        </h2>
        {insight.related_cards.length === 0 ? (
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            The underlying signals are no longer available.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {insight.related_cards.map((card) => (
              <ConstituentCard key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>

      {/* Action footer */}
      <footer className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-2">
        <Link
          to={`/ask?q=${encodeURIComponent(insight.pattern_title)}`}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue/90 rounded-lg transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          Ask Foresight about this pattern
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {insight.status === "active" && (
            <>
              <button
                onClick={() => updateStatus("acted_on")}
                disabled={updatingStatus}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-green hover:bg-brand-green/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark as acted on
              </button>
              <button
                onClick={() => updateStatus("dismissed")}
                disabled={updatingStatus}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Dismiss
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constituent card (lightweight, links to full signal detail)
// ---------------------------------------------------------------------------

function ConstituentCard({ card }: { card: RelatedCard }) {
  const stageNumber = parseStageNumber(card.stage_id);
  return (
    <Link
      to={`/signals/${card.slug}`}
      className="block bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <div className="h-1 bg-gradient-to-r from-brand-blue to-brand-green" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white line-clamp-2">
            {card.name}
          </h3>
          <QualityScoreBadge score={card.signal_quality_score} size="sm" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4">
          {card.summary}
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <PillarBadge pillarId={card.pillar_id} size="sm" />
          <HorizonBadge horizon={card.horizon} size="sm" />
          {stageNumber && <StageBadge stage={stageNumber} size="sm" />}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>Impact {card.impact_score}</span>
          <span>Rel. {card.relevance_score}</span>
        </div>
      </div>
    </Link>
  );
}
