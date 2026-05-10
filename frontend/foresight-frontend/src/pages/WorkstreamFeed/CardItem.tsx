/**
 * Single intelligence-card tile shown in the WorkstreamFeed grid. Renders
 * taxonomy badges, a follow toggle (heart), score breakdown, and a "View
 * Details" link.
 *
 * @module pages/WorkstreamFeed/CardItem
 */

import { Link } from "react-router-dom";
import { Eye, Heart } from "lucide-react";
import { HorizonBadge } from "../../components/HorizonBadge";
import { PillarBadge } from "../../components/PillarBadge";
import { StageBadge } from "../../components/StageBadge";
import { Top25Badge } from "../../components/Top25Badge";
import { cn } from "../../lib/utils";
import type { Card } from "./types";

interface CardItemProps {
  card: Card;
  isFollowed: boolean;
  onToggleFollow: (cardId: string, isFollowed: boolean) => void;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export function CardItem({ card, isFollowed, onToggleFollow }: CardItemProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6 border-l-4 border-transparent transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-l-brand-blue">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium leading-snug text-gray-900 dark:text-white mb-2 break-words">
            <Link
              to={`/signals/${card.slug}`}
              className="hover:text-brand-blue transition-colors"
            >
              {card.name}
            </Link>
          </h3>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <PillarBadge pillarId={card.pillar_id} size="sm" />
            <HorizonBadge horizon={card.horizon} size="sm" />
            <StageBadge
              stage={card.stage_id}
              size="sm"
              showName={false}
              variant="minimal"
            />
            {card.top25_priorities && card.top25_priorities.length > 0 && (
              <Top25Badge
                priorities={card.top25_priorities}
                size="sm"
                showCount
              />
            )}
          </div>
        </div>
        <button
          onClick={() => onToggleFollow(card.id, isFollowed)}
          className={cn(
            "flex-shrink-0 p-2 transition-colors rounded-full",
            isFollowed
              ? "text-red-500 hover:text-red-600 hover:bg-red-50"
              : "text-gray-400 hover:text-red-500 hover:bg-gray-50",
          )}
          title={isFollowed ? "Unfollow signal" : "Follow signal"}
          aria-label={isFollowed ? "Unfollow signal" : "Follow signal"}
        >
          <Heart className={cn("h-5 w-5", isFollowed && "fill-current")} />
        </button>
      </div>

      <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
        {card.summary}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <ScoreRow label="Impact" value={card.impact_score} />
        <ScoreRow label="Relevance" value={card.relevance_score} />
        <ScoreRow label="Velocity" value={card.velocity_score} />
        <ScoreRow label="Novelty" value={card.novelty_score} />
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
        <Link
          to={`/signals/${card.slug}`}
          className="inline-flex items-center text-sm text-brand-blue hover:text-brand-dark-blue dark:hover:text-brand-light-blue transition-colors"
        >
          <Eye className="h-4 w-4 mr-1" />
          View Details
        </Link>
      </div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}:</span>
      <span className={getScoreColor(value)}>{value}</span>
    </div>
  );
}
