/**
 * List-view row for a single personal signal. Memoised because the parent
 * virtualised list re-renders frequently as the user scrolls.
 *
 * @module pages/Signals/SignalListItem
 */

import React from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { HorizonBadge } from "../../components/HorizonBadge";
import { PillarBadge } from "../../components/PillarBadge";
import { QualityScoreBadge } from "../../components/QualityScoreBadge";
import { StageBadge } from "../../components/StageBadge";
import { Top25Badge } from "../../components/Top25Badge";
import { TrendBadge, type TrendDirection } from "../../components/TrendBadge";
import {
  VelocityBadge,
  type VelocityTrend,
} from "../../components/VelocityBadge";
import { parseStageNumber } from "../../lib/stage-utils";
import { SourceBadge } from "./SourceBadge";
import type { PersonalSignal } from "./types";

interface SignalListItemProps {
  signal: PersonalSignal;
  onTogglePin: (cardId: string, currentlyPinned: boolean) => void;
}

export const SignalListItem: React.FC<SignalListItemProps> = React.memo(
  ({ signal, onTogglePin }) => {
    const stageNumber = parseStageNumber(signal.stage_id);

    return (
      <div className="relative flex items-center gap-4 bg-white dark:bg-dark-surface rounded-xl shadow-sm p-4 hover:shadow-lg transition-all duration-200 group">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(signal.id, signal.is_pinned);
          }}
          className={`shrink-0 p-1.5 rounded-lg transition-all duration-200 active:scale-75 ${
            signal.is_pinned
              ? "text-amber-500 bg-amber-50 dark:bg-amber-900/30"
              : "text-gray-300 hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 opacity-0 group-hover:opacity-100"
          }`}
          aria-label={signal.is_pinned ? "Unpin signal" : "Pin signal"}
          title={signal.is_pinned ? "Unpin" : "Pin"}
        >
          <Star
            className={`w-4 h-4 ${signal.is_pinned ? "fill-amber-400" : ""}`}
          />
        </button>

        <div className="shrink-0">
          <QualityScoreBadge score={signal.signal_quality_score} size="lg" />
        </div>

        <Link
          to={`/signals/${signal.slug}`}
          state={{ from: "/signals" }}
          aria-label={`View signal: ${signal.name}`}
          className="flex-1 min-w-0"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-brand-blue transition-colors truncate">
            {signal.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {signal.summary}
          </p>
        </Link>

        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {signal.is_followed && <SourceBadge type="followed" />}
          {signal.is_created && <SourceBadge type="created" />}
          {signal.workstream_names.length > 0 && (
            <SourceBadge
              type="workstream"
              label={
                signal.workstream_names.length === 1
                  ? signal.workstream_names[0]
                  : `${signal.workstream_names.length} workstreams`
              }
            />
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <PillarBadge pillarId={signal.pillar_id} size="sm" />
          <HorizonBadge horizon={signal.horizon} size="sm" />
          {stageNumber && <StageBadge stage={stageNumber} size="sm" />}
          {signal.top25_relevance && signal.top25_relevance.length > 0 && (
            <Top25Badge priorities={signal.top25_relevance} size="sm" />
          )}
          <VelocityBadge
            trend={signal.velocity_trend as VelocityTrend}
            score={signal.velocity_score}
          />
          <TrendBadge direction={signal.trend_direction as TrendDirection} />
        </div>

        <div className="hidden md:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <span>Impact {signal.impact_score}</span>
          <span>Rel. {signal.relevance_score}</span>
        </div>

        <div className="text-xs text-gray-400 shrink-0 hidden lg:block">
          {new Date(signal.updated_at).toLocaleDateString()}
        </div>
      </div>
    );
  },
);

SignalListItem.displayName = "SignalListItem";
