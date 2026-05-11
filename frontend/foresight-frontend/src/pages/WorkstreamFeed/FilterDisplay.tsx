/**
 * Active-filters panel beneath the WorkstreamFeed header. Renders pillar
 * badges, the horizon badge, a stage range/list, and keyword pills; falls
 * back to an "all signals" hint when no filters are configured.
 *
 * @module pages/WorkstreamFeed/FilterDisplay
 */

import { HorizonBadge } from "../../components/HorizonBadge";
import { PillarBadgeGroup } from "../../components/PillarBadge";
import { KeywordTag, StageRangeDisplay } from "./badges";
import type { Workstream } from "./types";

export function FilterDisplay({ workstream }: { workstream: Workstream }) {
  const hasPillars = !!(
    workstream.pillar_ids && workstream.pillar_ids.length > 0
  );
  const hasHorizon = !!(workstream.horizon && workstream.horizon !== "ALL");
  const hasStages = !!(workstream.stage_ids && workstream.stage_ids.length > 0);
  const hasKeywords = !!(workstream.keywords && workstream.keywords.length > 0);
  const hasAnyFilter = hasPillars || hasHorizon || hasStages || hasKeywords;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6 mb-6">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        Active Filters
      </h2>

      <div className="space-y-4">
        {hasPillars && (
          <FilterRow label="Pillars" alignTop>
            <PillarBadgeGroup
              pillarIds={workstream.pillar_ids!}
              size="sm"
              maxVisible={6}
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
          <FilterRow label="Stages" alignTop>
            <StageRangeDisplay stageIds={workstream.stage_ids!} />
          </FilterRow>
        )}

        {hasKeywords && (
          <FilterRow label="Keywords" alignTop>
            <div className="flex items-center gap-1.5 flex-wrap">
              {workstream.keywords!.map((keyword) => (
                <KeywordTag key={keyword} keyword={keyword} />
              ))}
            </div>
          </FilterRow>
        )}

        {!hasAnyFilter && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No filters configured. Showing all signals.
          </p>
        )}
      </div>
    </div>
  );
}

interface FilterRowProps {
  label: string;
  alignTop?: boolean;
  children: React.ReactNode;
}

function FilterRow({ label, alignTop, children }: FilterRowProps) {
  return (
    <div className={`flex ${alignTop ? "items-start" : "items-center"} gap-3`}>
      <span
        className={`text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0 ${alignTop ? "pt-0.5" : ""}`}
      >
        {label}:
      </span>
      {children}
    </div>
  );
}
