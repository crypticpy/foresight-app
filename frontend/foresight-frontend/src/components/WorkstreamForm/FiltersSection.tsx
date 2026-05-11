/**
 * Pillar / Goal / Stage / Horizon filter selectors. The four filter
 * groups travel together visually in both create and edit mode, so they
 * share one component file.
 *
 * @module components/WorkstreamForm/FiltersSection
 */

import { useWorkstreamForm } from "../../hooks/useWorkstreamForm";
import { cn } from "../../lib/utils";
import {
  getGoalsByPillar,
  horizons,
  pillars,
  stages,
} from "../../data/taxonomy";
import { PillarBadge } from "../PillarBadge";
import { FormSection } from "../workstream/FormSection";

type Form = ReturnType<typeof useWorkstreamForm>;

export interface FiltersSectionProps {
  form: Form;
}

export function FiltersSection({ form }: FiltersSectionProps) {
  return (
    <>
      <FormSection
        title="Pillars"
        description="Optionally select strategic pillars to filter by, or leave empty for a topic-driven workstream"
      >
        <div className="flex flex-wrap gap-2">
          {pillars.map((pillar) => (
            <button
              key={pillar.code}
              type="button"
              onClick={() => form.handlePillarToggle(pillar.code)}
              className={cn(
                "transition-all duration-200",
                form.formData.pillar_ids.includes(pillar.code)
                  ? "ring-2 ring-brand-blue ring-offset-1 dark:ring-offset-dark-surface rounded"
                  : "opacity-60 hover:opacity-100",
              )}
              aria-pressed={form.formData.pillar_ids.includes(pillar.code)}
              aria-label={`${pillar.name} pillar`}
            >
              <PillarBadge
                pillarId={pillar.code}
                size="md"
                showIcon={true}
                disableTooltip
              />
            </button>
          ))}
        </div>
      </FormSection>

      {form.formData.pillar_ids.length > 0 && (
        <FormSection
          title="Goals"
          description="Narrow down by specific goals within selected pillars"
        >
          <div className="space-y-4 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3 bg-gray-50 dark:bg-dark-surface-elevated">
            {form.formData.pillar_ids.map((pillarCode) => {
              const pillarGoals = getGoalsByPillar(pillarCode);
              const pillar = pillars.find((p) => p.code === pillarCode);
              if (!pillar || pillarGoals.length === 0) return null;

              return (
                <div key={pillarCode}>
                  <div className="flex items-center gap-2 mb-2">
                    <PillarBadge
                      pillarId={pillarCode}
                      size="sm"
                      showIcon={false}
                      disableTooltip
                    />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {pillar.name}
                    </span>
                  </div>
                  <div className="space-y-1 ml-4">
                    {pillarGoals.map((goal) => (
                      <label
                        key={goal.code}
                        className="flex items-start gap-2 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={form.formData.goal_ids.includes(goal.code)}
                          onChange={() => form.handleGoalToggle(goal.code)}
                          className="mt-0.5 h-4 w-4 text-brand-blue border-gray-300 dark:border-gray-500 rounded focus:ring-brand-blue"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-1">
                            {goal.code}
                          </span>
                          {goal.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </FormSection>
      )}

      <FormSection
        title="Maturity Stages"
        description="Filter by technology maturity stage (1-8)"
      >
        <div className="flex flex-wrap gap-2">
          {stages.map((stage) => (
            <button
              key={stage.stage}
              type="button"
              onClick={() => form.handleStageToggle(stage.stage)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md border transition-colors",
                form.formData.stage_ids.includes(stage.stage.toString())
                  ? "bg-brand-light-blue dark:bg-brand-blue/20 border-brand-blue text-brand-dark-blue dark:text-brand-light-blue"
                  : "bg-white dark:bg-dark-surface-elevated border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-surface-hover",
              )}
              aria-pressed={form.formData.stage_ids.includes(
                stage.stage.toString(),
              )}
              title={`${stage.name}: ${stage.description}`}
            >
              {stage.stage}. {stage.name}
            </button>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Horizon"
        description="Filter by strategic planning horizon"
      >
        <div className="flex flex-wrap gap-2">
          {[
            { code: "ALL", name: "All Horizons", timeframe: "" },
            ...horizons,
          ].map((h) => (
            <button
              key={h.code}
              type="button"
              onClick={() => form.handleHorizonChange(h.code)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md border transition-colors",
                form.formData.horizon === h.code
                  ? "bg-brand-light-blue dark:bg-brand-blue/20 border-brand-blue text-brand-dark-blue dark:text-brand-light-blue"
                  : "bg-white dark:bg-dark-surface-elevated border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-surface-hover",
              )}
              aria-pressed={form.formData.horizon === h.code}
            >
              {h.code === "ALL" ? "All" : h.code}
              {h.code !== "ALL" && (
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                  ({(h as (typeof horizons)[0]).timeframe})
                </span>
              )}
            </button>
          ))}
        </div>
      </FormSection>
    </>
  );
}
