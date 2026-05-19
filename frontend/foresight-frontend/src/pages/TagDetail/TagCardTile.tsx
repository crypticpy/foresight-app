/**
 * Slim card tile for the tag detail page. Visually consistent with
 * `pages/Signals/SignalCard` but without per-viewer pin / follow
 * affordances — the tag page is a global view, so user-scoped state
 * isn't loaded here.
 *
 * @module pages/TagDetail/TagCardTile
 */

import React from "react";
import { Link } from "react-router-dom";
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
import type { TagDetailCard } from "../../lib/tags-api";

interface TagCardTileProps {
  card: TagDetailCard;
}

export const TagCardTile: React.FC<TagCardTileProps> = React.memo(
  ({ card }) => {
    const stageNumber = card.stage_id ? parseStageNumber(card.stage_id) : null;

    return (
      <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200 overflow-hidden group">
        <div className="h-1 bg-gradient-to-r from-brand-blue to-brand-green" />

        <Link
          to={`/signals/${card.slug}`}
          aria-label={`View signal: ${card.name}`}
          className="block"
        >
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="min-w-0 flex-1 text-lg font-semibold text-gray-900 dark:text-white group-hover:text-brand-blue transition-colors line-clamp-2">
                {card.name}
              </h3>
              <QualityScoreBadge
                score={card.signal_quality_score ?? null}
                size="sm"
              />
            </div>

            {card.summary && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4">
                {card.summary}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-3">
              {card.pillar_id && (
                <PillarBadge pillarId={card.pillar_id} size="sm" />
              )}
              {card.horizon && (
                <HorizonBadge
                  horizon={card.horizon as "H1" | "H2" | "H3"}
                  size="sm"
                />
              )}
              {stageNumber && <StageBadge stage={stageNumber} size="sm" />}
              {card.top25_relevance && card.top25_relevance.length > 0 && (
                <Top25Badge priorities={card.top25_relevance} size="sm" />
              )}
              <VelocityBadge
                trend={card.velocity_trend as VelocityTrend}
                score={card.velocity_score ?? undefined}
              />
              <TrendBadge direction={card.trend_direction as TrendDirection} />
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Impact {card.impact_score ?? 0}</span>
              <span>Rel. {card.relevance_score ?? 0}</span>
              {card.updated_at && (
                <span className="ml-auto">
                  {new Date(card.updated_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </Link>
      </div>
    );
  },
);

TagCardTile.displayName = "TagCardTile";
