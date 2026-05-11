/**
 * Following Signals row: the first three followed cards with priority-tinted
 * gradient cards, badges, and a key-metric line. Empty-state CTA points to
 * /discover when the user isn't following anything yet.
 *
 * @module pages/Dashboard/FollowingSignals
 */

import { Link } from "react-router-dom";
import { ArrowRight, Eye, Star } from "lucide-react";
import { PillarBadge } from "../../components/PillarBadge";
import { HorizonBadge } from "../../components/HorizonBadge";
import { StageBadge } from "../../components/StageBadge";
import { Top25Badge } from "../../components/Top25Badge";
import {
  VelocityBadge,
  type VelocityTrend,
} from "../../components/VelocityBadge";
import { parseStageNumber } from "../../lib/stage-utils";
import type { FollowingCard } from "../../hooks/useDashboardData";
import {
  getPriorityBorder,
  getPriorityColor,
  getPriorityGradient,
} from "./priorityStyles";

interface FollowingSignalsProps {
  followingCards: FollowingCard[];
}

export function FollowingSignals({ followingCards }: FollowingSignalsProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Your Followed Signals
        </h2>
      </div>
      {followingCards.length > 0 ? (
        <div className="grid gap-4">
          {followingCards.slice(0, 3).map((following, index) => {
            const stageNum = parseStageNumber(following.cards.stage_id);
            return (
              <div
                key={following.id}
                style={{
                  animationDelay: `${Math.min(index, 5) * 50}ms`,
                  animationFillMode: "both",
                }}
                className={`animate-in fade-in slide-in-from-bottom-2 duration-300 bg-gradient-to-r ${getPriorityGradient(following.priority)} to-white dark:to-[#2d3166] rounded-xl shadow p-6 border-l-4 ${getPriorityBorder(following.priority)} transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        <Link
                          to={`/signals/${following.cards.slug}`}
                          state={{ from: "/" }}
                          className="hover:text-brand-blue transition-colors"
                        >
                          {following.cards.name}
                        </Link>
                      </h3>
                      <PillarBadge
                        pillarId={following.cards.pillar_id}
                        showIcon={true}
                        size="sm"
                      />
                      <HorizonBadge
                        horizon={following.cards.horizon}
                        size="sm"
                      />
                      {stageNum && (
                        <StageBadge
                          stage={stageNum}
                          size="sm"
                          showName={false}
                          variant="minimal"
                        />
                      )}
                      <VelocityBadge
                        trend={following.cards.velocity_trend as VelocityTrend}
                        score={following.cards.velocity_score}
                      />
                      {following.cards.top25_relevance &&
                        following.cards.top25_relevance.length > 0 && (
                          <Top25Badge
                            priorities={following.cards.top25_relevance}
                            size="sm"
                            showCount={true}
                          />
                        )}
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(following.priority)}`}
                      >
                        {following.priority}
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mb-3">
                      {following.cards.summary}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-brand-blue"></span>
                        Impact: {following.cards.impact_score}/100
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-extended-purple"></span>
                        Relevance: {following.cards.relevance_score}/100
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
          <Star className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Start Following Signals
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Follow signals to build your personalized intelligence feed.
            <br />
            <span className="text-gray-400">
              Browse the Discover page and click the star icon on any signal to
              start following it.
            </span>
          </p>
          <div className="mt-6">
            <Link
              to="/discover"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue transition-colors"
            >
              <Eye className="h-4 w-4 mr-2" />
              Explore Signals
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
