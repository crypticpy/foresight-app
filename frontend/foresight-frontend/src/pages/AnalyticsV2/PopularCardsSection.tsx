/**
 * Linked list of "popular signals" with pillar + horizon badges, summary
 * snippet, and a follower count. Used for both the "popular but not
 * followed" and "trending this week" panels.
 *
 * @module pages/AnalyticsV2/PopularCardsSection
 */

import { Link } from "react-router-dom";
import { Star, Users } from "lucide-react";
import { PillarBadge } from "../../components/PillarBadge";
import { HorizonBadge } from "../../components/HorizonBadge";
import { EmptyState } from "./common";
import type { PopularCard } from "./types";

interface PopularCardsSectionProps {
  cards: PopularCard[];
  title: string;
  subtitle: string;
  emptyMessage: string;
}

export function PopularCardsSection({
  cards,
  title,
  subtitle,
  emptyMessage,
}: PopularCardsSectionProps) {
  if (cards.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" />
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {subtitle}
        </p>
        <EmptyState
          title="No suggestions yet"
          description={emptyMessage}
          icon={<Star className="h-6 w-6 text-gray-400" />}
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        <Star className="h-5 w-5 text-amber-500" />
        {title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {subtitle}
      </p>
      <div className="space-y-3">
        {cards.map((card) => (
          <Link
            key={card.card_id}
            to={`/signals/${card.card_slug || card.card_id}`}
            className="block p-3 bg-gray-50 dark:bg-dark-surface rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface-elevated transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {card.card_name}
                  </span>
                  {card.pillar_id && (
                    <PillarBadge pillarId={card.pillar_id} size="sm" />
                  )}
                  {card.horizon && (
                    <HorizonBadge
                      horizon={card.horizon as "H1" | "H2" | "H3"}
                      size="sm"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {card.summary}
                </p>
              </div>
              <div className="ml-3 flex items-center gap-1 text-xs text-gray-400">
                <Users className="h-3 w-3" />
                {card.follower_count}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
