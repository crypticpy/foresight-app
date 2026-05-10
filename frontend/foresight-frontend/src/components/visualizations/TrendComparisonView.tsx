/**
 * Side-by-side comparison view for two trend cards: card-metadata
 * headers, latest-score delta table, synchronized timeline of the
 * selected score, per-card score histories, and stage progressions.
 *
 * State and rendering are split into the focused sub-modules in
 * `./TrendComparisonView/`. This file owns the page layout, the data
 * fetch (`compareCards`), and the derived `useMemo`s.
 *
 * Access via URL: `/compare?card_ids=id1,id2` — or pass `cardIds`
 * directly as a prop.
 *
 * @module components/visualizations/TrendComparisonView
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { format, parseISO } from "date-fns";

import { cn } from "../../lib/utils";
import { parseStageNumber } from "../../lib/stage-utils";
import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";

import {
  compareCards,
  type CardComparisonResponse,
} from "../../lib/discovery-api";
import { ScoreTimelineChart, type ScoreType } from "./ScoreTimelineChart";
import { StageProgressionTimeline } from "./StageProgressionTimeline";

import { CardHeader } from "./TrendComparisonView/CardHeader";
import { ScoreComparison } from "./TrendComparisonView/ScoreComparison";
import { SynchronizedTimeline } from "./TrendComparisonView/SynchronizedTimeline";
import {
  ErrorState,
  InvalidParamsState,
  LoadingState,
} from "./TrendComparisonView/states";
import {
  calculateScoreDifferences,
  mergeScoreHistories,
} from "./TrendComparisonView/data";

export interface TrendComparisonViewProps {
  /** Card IDs to compare (overrides URL params) */
  cardIds?: [string, string];
  /** Additional className for container */
  className?: string;
  /** Callback when a card is clicked */
  onCardClick?: (cardId: string) => void;
}

const PAGE_WRAPPER = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8";

export function TrendComparisonView({
  cardIds: propCardIds,
  className,
  onCardClick,
}: TrendComparisonViewProps) {
  const { user } = useAuthContext();
  const [searchParams] = useSearchParams();

  const [comparisonData, setComparisonData] =
    useState<CardComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScore, setSelectedScore] =
    useState<ScoreType>("maturity_score");

  const cardIds = useMemo((): [string, string] | null => {
    if (propCardIds) return propCardIds;

    const idsParam = searchParams.get("card_ids");
    if (!idsParam) return null;

    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length !== 2) return null;

    return [ids[0]!, ids[1]!];
  }, [propCardIds, searchParams]);

  const fetchComparisonData = useCallback(async () => {
    if (!cardIds || !user) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");

      const data = await compareCards(token, cardIds[0], cardIds[1]);
      setComparisonData(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load comparison data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [cardIds, user]);

  useEffect(() => {
    fetchComparisonData();
  }, [fetchComparisonData]);

  const mergedHistory = useMemo(() => {
    if (!comparisonData) return [];
    return mergeScoreHistories(
      comparisonData.card1.score_history,
      comparisonData.card2.score_history,
    );
  }, [comparisonData]);

  const scoreDifferences = useMemo(() => {
    if (!comparisonData) return [];
    return calculateScoreDifferences(
      comparisonData.card1.card,
      comparisonData.card2.card,
    );
  }, [comparisonData]);

  if (!cardIds) {
    return (
      <div className={cn(PAGE_WRAPPER, className)}>
        <InvalidParamsState />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn(PAGE_WRAPPER, className)}>
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(PAGE_WRAPPER, className)}>
        <ErrorState message={error} onRetry={fetchComparisonData} />
      </div>
    );
  }

  if (!comparisonData) {
    return (
      <div className={cn(PAGE_WRAPPER, className)}>
        <ErrorState
          message="No comparison data available"
          onRetry={fetchComparisonData}
        />
      </div>
    );
  }

  const { card1, card2 } = comparisonData;

  return (
    <div className={cn(PAGE_WRAPPER, className)}>
      <div className="mb-8">
        <Link
          to="/discover"
          className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-brand-blue mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Discover
        </Link>

        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-8 w-8 text-brand-blue" />
          <h1 className="text-2xl font-bold text-brand-dark-blue dark:text-white">
            Trend Comparison
          </h1>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Comparing score trends and progression between two signals
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Generated:{" "}
          {format(
            parseISO(comparisonData.comparison_generated_at),
            "MMM d, yyyy h:mm a",
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <CardHeader
          card={card1.card}
          label="Signal A"
          onCardClick={onCardClick}
        />
        <CardHeader
          card={card2.card}
          label="Signal B"
          onCardClick={onCardClick}
        />
      </div>

      <div className="mb-8">
        <ScoreComparison
          differences={scoreDifferences}
          card1Name={card1.card.name}
          card2Name={card2.card.name}
        />
      </div>

      <div className="mb-8">
        <SynchronizedTimeline
          data={mergedHistory}
          card1Name={card1.card.name}
          card2Name={card2.card.name}
          selectedScore={selectedScore}
          onScoreChange={setSelectedScore}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ScoreTimelineChart
          data={card1.score_history}
          title={`${card1.card.name} - Score History`}
          height={300}
        />
        <ScoreTimelineChart
          data={card2.score_history}
          title={`${card2.card.name} - Score History`}
          height={300}
        />
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Stage Progression Comparison
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              {card1.card.name}
            </h3>
            <StageProgressionTimeline
              stageHistory={card1.stage_history}
              currentStage={parseStageNumber(card1.card.stage_id) ?? undefined}
              compact
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              {card2.card.name}
            </h3>
            <StageProgressionTimeline
              stageHistory={card2.stage_history}
              currentStage={parseStageNumber(card2.card.stage_id) ?? undefined}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrendComparisonView;
