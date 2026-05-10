/**
 * Strategic Lens section: two-row aggregate over the lens metadata.
 * - Top row: anchor radar (left) + signal-type donut (right)
 * - Bottom row: CSP heatmap (2/3 width) + operational flags / issue tag
 *   cloud stack (1/3 width)
 *
 * Renders nothing when the lens overview hasn't been fetched yet.
 *
 * @module pages/Dashboard/StrategicLens
 */

import { useNavigate } from "react-router-dom";
import { AnchorRadar } from "../../components/dashboard/AnchorRadar";
import { CspHeatmap } from "../../components/dashboard/CspHeatmap";
import { SignalTypeDonut } from "../../components/dashboard/SignalTypeDonut";
import { IssueTagCloud } from "../../components/dashboard/IssueTagCloud";
import { FlagsRow } from "../../components/dashboard/FlagsRow";
import type { LensOverviewResponse } from "../../types/dashboard";

interface StrategicLensProps {
  lensOverview: LensOverviewResponse | null;
}

export function StrategicLens({ lensOverview }: StrategicLensProps) {
  const navigate = useNavigate();

  if (!lensOverview) return null;

  return (
    <>
      <section
        className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5"
        aria-label="Strategic lens charts"
      >
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5 flex flex-col">
          <header className="mb-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Strategic Anchor Coverage
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Mean 0–100 score across {lensOverview.classified_card_count} of{" "}
              {lensOverview.total_active_cards} active cards.
            </p>
          </header>
          <div className="flex-1 flex items-center justify-center">
            <AnchorRadar data={lensOverview.anchor_means} size={240} />
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5 flex flex-col">
          <header className="mb-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Signal Type Mix
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Trend, driver, signal, or unclassified — per the foresight
              vocabulary.
            </p>
          </header>
          <div className="flex-1 flex items-center justify-center">
            <SignalTypeDonut
              data={lensOverview.signal_type_counts}
              size={200}
            />
          </div>
        </div>
      </section>

      <section
        className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-5"
        aria-label="Strategic lens overview"
      >
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5 lg:col-span-2">
          <header className="mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              CSP Goal Coverage
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Active cards per CSP goal, grouped by pillar.
            </p>
          </header>
          <CspHeatmap
            data={lensOverview.csp_coverage}
            onGoalClick={(goal) =>
              navigate(
                `/discover?goal=${encodeURIComponent(
                  goal.goal_id,
                )}&goal_label=${encodeURIComponent(
                  `${goal.code} — ${goal.name}`,
                )}`,
              )
            }
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5">
            <header className="mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Operational Flags
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Highly relevant to budget or climate.
              </p>
            </header>
            <FlagsRow
              budgetFlagCount={lensOverview.budget_flag_count}
              climateFlagCount={lensOverview.climate_flag_count}
              totalActiveCards={lensOverview.total_active_cards}
            />
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5">
            <header className="mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Top Issue Tags
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Most-tagged issues — size scales with count.
              </p>
            </header>
            <IssueTagCloud data={lensOverview.top_issue_tags} />
          </div>
        </div>
      </section>
    </>
  );
}
