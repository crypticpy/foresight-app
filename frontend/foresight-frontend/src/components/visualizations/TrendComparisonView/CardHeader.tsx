/**
 * Header tile for one of the two cards in the comparison view: signal
 * name, summary, and metadata badges (pillar / horizon / stage), with
 * an optional external-link affordance.
 *
 * @module components/visualizations/TrendComparisonView/CardHeader
 */

import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { parseStageNumber } from "../../../lib/stage-utils";
import { PillarBadge } from "../../PillarBadge";
import { HorizonBadge } from "../../HorizonBadge";
import { StageBadge } from "../../StageBadge";
import type { CardData } from "../../../lib/discovery-api";

export interface CardHeaderProps {
  card: CardData;
  label: string;
  onCardClick?: (cardId: string) => void;
}

export function CardHeader({ card, label, onCardClick }: CardHeaderProps) {
  const stageNumber = parseStageNumber(card.stage_id);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {label}
        </span>
        {onCardClick && (
          <button
            onClick={() => onCardClick(card.id)}
            className="text-brand-blue hover:text-brand-dark-blue transition-colors"
            title="View signal details"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
      </div>

      <Link to={`/signals/${card.slug}`} className="block group">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-brand-blue transition-colors line-clamp-2">
          {card.name}
        </h3>
      </Link>

      {card.summary && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
          {card.summary}
        </p>
      )}

      <div className="flex items-center flex-wrap gap-2 mt-3">
        {card.pillar_id && <PillarBadge pillarId={card.pillar_id} size="sm" />}
        {card.horizon && <HorizonBadge horizon={card.horizon} size="sm" />}
        {stageNumber && <StageBadge stage={stageNumber} size="sm" showName />}
      </div>
    </div>
  );
}
