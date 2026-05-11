/**
 * Step 3 of the wizard. Renders a read-only summary of the user's choices
 * across all prior steps plus a radio group for "Initial Research" depth
 * (Quick scan vs Deep dive). The summary content branches on `state.mode`.
 *
 * @module CreateSignal/components/ReviewStep
 */

import { Search, Telescope, Zap, PenTool } from "lucide-react";
import { cn } from "../../../lib/utils";
import { getHorizonLabel, getPillarLabel, getStageLabel } from "../constants";
import type { WizardState, WorkstreamOption } from "../wizardState";

export interface ReviewStepProps {
  state: WizardState;
  workstreams: WorkstreamOption[];
  onResearchDepthChange: (depth: "quick" | "deep") => void;
}

function getSourceSummary(state: WizardState): string {
  const count = state.sourcePreferences.enabled_categories.length;
  const domains = state.sourcePreferences.priority_domains.length;
  const feeds = state.sourcePreferences.custom_rss_feeds.length;
  const keywords = state.sourcePreferences.keywords.length;
  const parts: string[] = [];
  if (count > 0)
    parts.push(`${count} source categor${count === 1 ? "y" : "ies"}`);
  if (domains > 0)
    parts.push(`${domains} priority domain${domains === 1 ? "" : "s"}`);
  if (feeds > 0) parts.push(`${feeds} custom feed${feeds === 1 ? "" : "s"}`);
  if (keywords > 0)
    parts.push(`${keywords} keyword${keywords === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "Default settings";
}

export function ReviewStep({
  state,
  workstreams,
  onResearchDepthChange,
}: ReviewStepProps) {
  return (
    <div className="space-y-5">
      {/* Signal Summary */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Signal Summary
        </h3>
        <div
          className={cn(
            "rounded-xl border p-4 space-y-3",
            "bg-gray-50 dark:bg-dark-surface",
            "border-gray-200 dark:border-gray-600",
          )}
        >
          {state.mode === "quick" ? (
            <>
              <div className="flex items-start gap-2">
                <Zap
                  className="h-4 w-4 mt-0.5 text-brand-blue shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Mode
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    Quick Create (AI-generated)
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Search
                  className="h-4 w-4 mt-0.5 text-gray-400 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Topic
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {state.topic}
                  </div>
                </div>
              </div>
              {state.workstreamId && (
                <div className="flex items-start gap-2">
                  <div className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Workstream
                    </div>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {workstreams.find((ws) => ws.id === state.workstreamId)
                        ?.name || state.workstreamId}
                    </div>
                  </div>
                </div>
              )}
              {state.keywords.length > 0 && (
                <div className="flex items-start gap-2">
                  <div className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Keywords
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {state.keywords.map((kw) => (
                        <span
                          key={kw}
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full",
                            "bg-blue-50 text-blue-700 border border-blue-200",
                            "dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
                            "text-xs",
                          )}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <PenTool
                  className="h-4 w-4 mt-0.5 text-brand-blue shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Mode
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    Manual Create
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Signal Name
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                    {state.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Horizon
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                    {getHorizonLabel(state.horizon)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Stage
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                    {getStageLabel(state.stage)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Pillar(s)
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                    {state.isExploratory
                      ? "Exploratory"
                      : state.selectedPillars.length > 0
                        ? state.selectedPillars.map(getPillarLabel).join(", ")
                        : "None selected"}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 line-clamp-3">
                  {state.description}
                </div>
              </div>
              {state.seedUrls.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Seed URLs
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                    {state.seedUrls.length} URL
                    {state.seedUrls.length !== 1 ? "s" : ""}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Source Preferences Summary */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Source Preferences
        </h3>
        <div
          className={cn(
            "rounded-xl border p-4",
            "bg-gray-50 dark:bg-dark-surface",
            "border-gray-200 dark:border-gray-600",
          )}
        >
          <div className="text-sm text-gray-900 dark:text-gray-100">
            {getSourceSummary(state)}
          </div>
          {state.sourcePreferences.enabled_categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {state.sourcePreferences.enabled_categories.map((cat) => (
                <span
                  key={cat}
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full",
                    "bg-brand-blue/10 text-brand-blue border border-brand-blue/20",
                    "dark:bg-brand-blue/20 dark:text-blue-300 dark:border-brand-blue/30",
                    "text-xs capitalize",
                  )}
                >
                  {cat.replace("_", " ")}
                </span>
              ))}
            </div>
          )}
          {state.sourcePreferences.preferred_type && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Preferred type:{" "}
              <span className="text-gray-700 dark:text-gray-300">
                {state.sourcePreferences.preferred_type.replace("_", " ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Research Depth */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Initial Research
        </h3>
        <div
          className="space-y-2"
          role="radiogroup"
          aria-label="Research depth"
        >
          <label
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer",
              "transition-colors duration-200",
              state.researchDepth === "quick"
                ? "bg-brand-blue/10 border-brand-blue dark:bg-brand-blue/20 dark:border-brand-blue/60"
                : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500",
            )}
          >
            <input
              type="radio"
              name="research_depth"
              value="quick"
              checked={state.researchDepth === "quick"}
              onChange={() => onResearchDepthChange("quick")}
              className={cn(
                "h-4 w-4 border-gray-300 dark:border-gray-600",
                "text-brand-blue focus:ring-brand-blue",
              )}
            />
            <div className="flex items-center gap-2.5 flex-1">
              <Search
                className={cn(
                  "h-5 w-5 shrink-0",
                  state.researchDepth === "quick"
                    ? "text-brand-blue"
                    : "text-gray-400",
                )}
                aria-hidden="true"
              />
              <div>
                <div
                  className={cn(
                    "text-sm font-medium",
                    state.researchDepth === "quick"
                      ? "text-brand-blue dark:text-blue-300"
                      : "text-gray-900 dark:text-gray-100",
                  )}
                >
                  Quick scan
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  ~5 sources, faster results
                </div>
              </div>
            </div>
          </label>

          <label
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer",
              "transition-colors duration-200",
              state.researchDepth === "deep"
                ? "bg-brand-blue/10 border-brand-blue dark:bg-brand-blue/20 dark:border-brand-blue/60"
                : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500",
            )}
          >
            <input
              type="radio"
              name="research_depth"
              value="deep"
              checked={state.researchDepth === "deep"}
              onChange={() => onResearchDepthChange("deep")}
              className={cn(
                "h-4 w-4 border-gray-300 dark:border-gray-600",
                "text-brand-blue focus:ring-brand-blue",
              )}
            />
            <div className="flex items-center gap-2.5 flex-1">
              <Telescope
                className={cn(
                  "h-5 w-5 shrink-0",
                  state.researchDepth === "deep"
                    ? "text-brand-blue"
                    : "text-gray-400",
                )}
                aria-hidden="true"
              />
              <div>
                <div
                  className={cn(
                    "text-sm font-medium",
                    state.researchDepth === "deep"
                      ? "text-brand-blue dark:text-blue-300"
                      : "text-gray-900 dark:text-gray-100",
                  )}
                >
                  Deep dive
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  ~15 sources, comprehensive analysis
                </div>
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
