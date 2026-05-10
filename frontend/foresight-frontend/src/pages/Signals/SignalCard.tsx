/**
 * Grid-view card for a single personal signal. Memoised because the parent
 * virtualised grid re-renders frequently as the user scrolls.
 *
 * @module pages/Signals/SignalCard
 */

import React from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { ArtifactRibbon } from "../../components/ArtifactIndicator";
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

interface SignalCardProps {
  signal: PersonalSignal;
  onTogglePin: (cardId: string, currentlyPinned: boolean) => void;
}

export const SignalCard: React.FC<SignalCardProps> = React.memo(
  ({ signal, onTogglePin }) => {
    const stageNumber = parseStageNumber(signal.stage_id);

    return (
      <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200 overflow-hidden group">
        <div className="h-1 bg-gradient-to-r from-brand-blue to-brand-green" />

        {/* Pin button — sole absolutely-positioned icon. Artifacts + quality
            score render inline beside the heading below. */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(signal.id, signal.is_pinned);
          }}
          className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg transition-all duration-200 active:scale-75 ${
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

        <Link
          to={`/signals/${signal.slug}`}
          state={{ from: "/signals" }}
          aria-label={`View signal: ${signal.name}`}
          className="block"
        >
          <div className="p-5">
            {/* pr-10 reserves space for the absolutely-positioned pin button. */}
            <div className="flex items-start justify-between gap-3 mb-3 pr-10">
              <h3 className="min-w-0 flex-1 text-lg font-semibold text-gray-900 dark:text-white group-hover:text-brand-blue transition-colors line-clamp-2">
                {signal.name}
              </h3>
              <div className="flex shrink-0 items-center gap-1.5">
                <ArtifactRibbon
                  artifacts={signal.artifacts}
                  className="static top-auto right-auto"
                />
                <QualityScoreBadge
                  score={signal.signal_quality_score}
                  size="sm"
                />
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4">
              {signal.summary}
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-3">
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
              <TrendBadge
                direction={signal.trend_direction as TrendDirection}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {signal.is_followed && <SourceBadge type="followed" />}
              {signal.is_created && <SourceBadge type="created" />}
              {signal.workstream_names.map((ws) => (
                <SourceBadge key={ws} type="workstream" label={ws} />
              ))}
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Impact {signal.impact_score}</span>
              <span>Rel. {signal.relevance_score}</span>
              <span className="ml-auto">
                {new Date(signal.updated_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </Link>
      </div>
    );
  },
);

SignalCard.displayName = "SignalCard";
