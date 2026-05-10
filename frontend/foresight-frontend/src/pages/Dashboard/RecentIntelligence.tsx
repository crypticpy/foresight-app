/**
 * Recent Intelligence list: all FullCards fresh off the discovery pipeline,
 * each with full lens metadata chips and key score metrics.
 *
 * @module pages/Dashboard/RecentIntelligence
 */

import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { PillarBadge } from "../../components/PillarBadge";
import { HorizonBadge } from "../../components/HorizonBadge";
import { StageBadge } from "../../components/StageBadge";
import { Top25Badge } from "../../components/Top25Badge";
import { QualityBadge } from "../../components/QualityBadge";
import {
  VelocityBadge,
  type VelocityTrend,
} from "../../components/VelocityBadge";
import { LensFlagChips } from "../../components/lens/LensFlagChips";
import { parseStageNumber } from "../../lib/stage-utils";
import type { FullCard } from "../../types/card";

interface RecentIntelligenceProps {
  recentCards: FullCard[];
}

export function RecentIntelligence({ recentCards }: RecentIntelligenceProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Recent Intelligence
        </h2>
        <Link
          to="/discover"
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-brand-blue bg-brand-light-blue hover:bg-brand-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
        >
          <Plus className="h-4 w-4 mr-1" />
          View All
        </Link>
      </div>
      <div className="grid gap-4">
        {recentCards.map((card, index) => {
          const stageNum = parseStageNumber(card.stage_id);
          return (
            <div
              key={card.id}
              style={{
                animationDelay: `${Math.min(index, 5) * 50}ms`,
                animationFillMode: "both",
              }}
              className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white dark:bg-dark-surface rounded-xl shadow p-6 border-l-4 border-transparent transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-l-brand-blue"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      <Link
                        to={`/signals/${card.slug}`}
                        state={{ from: "/" }}
                        className="hover:text-brand-blue transition-colors"
                      >
                        {card.name}
                      </Link>
                    </h3>
                    <QualityBadge score={card.signal_quality_score} size="sm" />
                    <PillarBadge
                      pillarId={card.pillar_id}
                      showIcon={true}
                      size="sm"
                    />
                    <HorizonBadge horizon={card.horizon} size="sm" />
                    {stageNum && (
                      <StageBadge
                        stage={stageNum}
                        size="sm"
                        showName={false}
                        variant="minimal"
                      />
                    )}
                    <VelocityBadge
                      trend={card.velocity_trend as VelocityTrend}
                      score={card.velocity_score}
                    />
                    {card.top25_relevance &&
                      card.top25_relevance.length > 0 && (
                        <Top25Badge
                          priorities={card.top25_relevance}
                          size="sm"
                          showCount={true}
                        />
                      )}
                    <LensFlagChips
                      budgetAssessment={card.budget_assessment ?? null}
                      climateAssessment={card.climate_assessment ?? null}
                      issueTags={card.issue_tags ?? null}
                    />
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-3">
                    {card.summary}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Impact: {card.impact_score}/100</span>
                    <span>Relevance: {card.relevance_score}/100</span>
                    <span>Velocity: {card.velocity_score}/100</span>
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <Link
                    to={`/signals/${card.slug}`}
                    state={{ from: "/" }}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
