/**
 * Read-only summary of the active workstream filters (pillars / horizon /
 * stages / keywords). Falls back to an italic "No filters configured" hint
 * when every filter is empty so the panel is never just a blank label.
 *
 * @module pages/WorkstreamKanban/FilterSummary
 */

import type { ReactNode } from "react";
import { HorizonBadge } from "../../components/HorizonBadge";
import { PillarBadgeGroup } from "../../components/PillarBadge";
import type { Workstream } from "../../components/WorkstreamForm";
import { KeywordTag, StageRangeDisplay } from "./badges";

interface FilterSummaryProps {
  workstream: Workstream;
}

export function FilterSummary({ workstream }: FilterSummaryProps) {
  const hasPillars = (workstream.pillar_ids?.length ?? 0) > 0;
  const hasHorizon = Boolean(
    workstream.horizon && workstream.horizon !== "ALL",
  );
  const hasStages = (workstream.stage_ids?.length ?? 0) > 0;
  const hasKeywords = (workstream.keywords?.length ?? 0) > 0;
  const hasAny = hasPillars || hasHorizon || hasStages || hasKeywords;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-4 mb-6">
      <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Active Filters
      </h2>
      <div className="flex items-center gap-6 flex-wrap text-sm">
        {hasPillars && (
          <FilterRow label="Pillars">
            <PillarBadgeGroup
              pillarIds={workstream.pillar_ids}
              size="sm"
              maxVisible={4}
            />
          </FilterRow>
        )}

        {hasHorizon && (
          <FilterRow label="Horizon">
            <HorizonBadge
              horizon={workstream.horizon as "H1" | "H2" | "H3"}
              size="sm"
            />
          </FilterRow>
        )}

        {hasStages && (
          <FilterRow label="Stages">
            <StageRangeDisplay stageIds={workstream.stage_ids} />
          </FilterRow>
        )}

        {hasKeywords && (
          <FilterRow label="Keywords">
            <div className="flex items-center gap-1.5 flex-wrap">
              {workstream.keywords.slice(0, 3).map((keyword) => (
                <KeywordTag key={keyword} keyword={keyword} />
              ))}
              {workstream.keywords.length > 3 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  +{workstream.keywords.length - 3} more
                </span>
              )}
            </div>
          </FilterRow>
        )}

        {!hasAny && (
          <p className="text-gray-500 dark:text-gray-400 italic">
            No filters configured
          </p>
        )}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-gray-600 dark:text-gray-400">{label}:</span>
      {children}
    </div>
  );
}
