/**
 * Card tile for a single workstream in the list view. Renders title /
 * description / badges (framework, view-only, role, scanning, auto-scan,
 * active), filter summary (pillars, drivers, goals, stages, horizon,
 * keywords), and the action row (Share / Members / Edit / Delete) when the
 * caller has manage capability.
 *
 * @module pages/Workstreams/WorkstreamCard
 */

import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  Lock,
  Pencil,
  Radar,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { DriverChip } from "../../components/DriverChip";
import { FrameworkBadge } from "../../components/FrameworkBadge";
import { PillarBadgeGroup } from "../../components/PillarBadge";
import { RoleBadge } from "../../components/collaboration/RoleBadge";
import type { Workstream } from "../../components/WorkstreamForm";
import { getGoalByCode } from "../../data/taxonomy";
import type { Driver } from "../../lib/frameworks-api";
import type { WorkstreamScanStatusResponse } from "../../lib/workstream-api";
import { useCapabilities } from "../../hooks/useCapabilities";
import { isOrgOwnedWorkstream } from "./ownership";

interface WorkstreamCardProps {
  workstream: Workstream;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onMembers: () => void;
  scanStatus?: WorkstreamScanStatusResponse | null;
  driversById?: Record<string, Driver>;
}

function formatStages(stageIds: string[]): string {
  if (stageIds.length === 0) return "";
  const nums = stageIds.map(Number).sort((a, b) => a - b);
  if (
    nums.length > 2 &&
    nums[nums.length - 1]! - nums[0]! === nums.length - 1
  ) {
    return `${nums[0]}-${nums[nums.length - 1]}`;
  }
  return nums.join(", ");
}

export function WorkstreamCard({
  workstream,
  onEdit,
  onDelete,
  onShare,
  onMembers,
  scanStatus,
  driversById,
}: WorkstreamCardProps) {
  const isOrgOwned = isOrgOwnedWorkstream(workstream);
  const { forWorkstream } = useCapabilities();
  const capabilities = forWorkstream(workstream);

  const stopAnd = (handler: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };

  return (
    <Link
      to={`/workstreams/${workstream.id}/board`}
      className="block bg-white dark:bg-dark-surface overflow-hidden rounded-xl shadow transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer"
    >
      <div className="bg-gradient-to-r from-brand-blue to-brand-green h-1" />

      <div className="p-6">
        <div className="mb-4">
          <h3 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white break-words leading-snug">
            {workstream.name}
          </h3>
          {workstream.description && (
            <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 line-clamp-2">
              {workstream.description}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {workstream.framework_code && (
              <FrameworkBadge
                code={workstream.framework_code}
                size="sm"
                disableTooltip
              />
            )}
            {isOrgOwned && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-dark-surface-elevated dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                title="Managed by admins — cannot be edited"
              >
                <Lock className="h-3 w-3" />
                View only
              </span>
            )}
            <RoleBadge role={workstream.role} />
            {scanStatus &&
              (scanStatus.status === "queued" ||
                scanStatus.status === "running") && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Scanning...
                </span>
              )}
            {workstream.auto_scan && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                <Radar className="h-3 w-3" />
                Auto-scan
              </span>
            )}
            {workstream.is_active ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Active
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                Inactive
              </span>
            )}
          </div>
        </div>

        <FilterSummary workstream={workstream} driversById={driversById} />

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Created {new Date(workstream.created_at).toLocaleDateString()}
            </span>
            {!capabilities.canManage ? (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                {capabilities.role === "org_viewer"
                  ? "Org access"
                  : capabilities.role
                    ? `Shared access (${capabilities.role})`
                    : "Read-only"}
              </span>
            ) : (
              <div className="flex items-center gap-2 flex-wrap justify-end max-sm:justify-start">
                <ActionButton
                  icon={<Share2 className="h-3.5 w-3.5 mr-1" />}
                  label="Share"
                  ariaLabel={`Share ${workstream.name}`}
                  onClick={stopAnd(onShare)}
                />
                <ActionButton
                  icon={<Users className="h-3.5 w-3.5 mr-1" />}
                  label="Members"
                  ariaLabel={`Manage members for ${workstream.name}`}
                  onClick={stopAnd(onMembers)}
                />
                <ActionButton
                  icon={<Pencil className="h-3.5 w-3.5 mr-1" />}
                  label="Edit"
                  ariaLabel={`Edit ${workstream.name}`}
                  onClick={stopAnd(onEdit)}
                />
                <ActionButton
                  icon={<Trash2 className="h-3.5 w-3.5 mr-1" />}
                  label="Delete"
                  ariaLabel={`Delete ${workstream.name}`}
                  onClick={stopAnd(onDelete)}
                  variant="danger"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

interface FilterSummaryProps {
  workstream: Workstream;
  driversById?: Record<string, Driver>;
}

function FilterSummary({ workstream, driversById }: FilterSummaryProps) {
  return (
    <div className="space-y-3 text-sm">
      {workstream.pillar_ids.length > 0 && (
        <SummarySection label="Pillars">
          <PillarBadgeGroup
            pillarIds={workstream.pillar_ids}
            size="sm"
            maxVisible={6}
          />
        </SummarySection>
      )}

      {workstream.driver_ids &&
        workstream.driver_ids.length > 0 &&
        driversById && (
          <SummarySection label="Drivers">
            <div className="flex flex-wrap gap-1.5">
              {workstream.driver_ids
                .map((id) => driversById[id])
                .filter((d): d is Driver => Boolean(d))
                .slice(0, 5)
                .map((d) => (
                  <DriverChip
                    key={d.id}
                    name={d.name}
                    description={d.description}
                    trackedMetricExamples={d.tracked_metric_examples}
                    selected
                    size="sm"
                  />
                ))}
              {workstream.driver_ids.length > 5 && (
                <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs">
                  +{workstream.driver_ids.length - 5} more
                </span>
              )}
            </div>
          </SummarySection>
        )}

      {workstream.goal_ids.length > 0 && (
        <SummarySection label="Goals">
          <div className="text-gray-600 dark:text-gray-300 text-sm">
            {workstream.goal_ids.length <= 3
              ? workstream.goal_ids
                  .map((id) => {
                    const goal = getGoalByCode(id);
                    return goal ? goal.code : id;
                  })
                  .join(", ")
              : `${workstream.goal_ids.length} goals selected`}
          </div>
        </SummarySection>
      )}

      <div className="flex flex-wrap gap-4">
        {workstream.stage_ids.length > 0 && (
          <SummarySection label="Stages">
            <span className="text-gray-600 dark:text-gray-300">
              {formatStages(workstream.stage_ids)}
            </span>
          </SummarySection>
        )}

        {workstream.horizon && workstream.horizon !== "ALL" && (
          <SummarySection label="Horizon">
            <span className="text-gray-600 dark:text-gray-300">
              {workstream.horizon}
            </span>
          </SummarySection>
        )}
      </div>

      {workstream.keywords.length > 0 && (
        <SummarySection label="Keywords">
          <div className="flex flex-wrap gap-1.5">
            {workstream.keywords.slice(0, 5).map((keyword) => (
              <span
                key={keyword}
                className="inline-flex px-2 py-0.5 rounded-full bg-brand-light-blue text-brand-blue dark:bg-brand-blue/20 dark:text-brand-light-blue text-xs font-medium"
              >
                {keyword}
              </span>
            ))}
            {workstream.keywords.length > 5 && (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs">
                +{workstream.keywords.length - 5} more
              </span>
            )}
          </div>
        </SummarySection>
      )}
    </div>
  );
}

function SummarySection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">
        {label}
      </span>
      {children}
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
  onClick: (e: MouseEvent) => void;
  variant?: "default" | "danger";
}

function ActionButton({
  icon,
  label,
  ariaLabel,
  onClick,
  variant = "default",
}: ActionButtonProps) {
  const variantClass =
    variant === "danger"
      ? "text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-900/20 focus:ring-red-500"
      : "text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:ring-brand-blue";
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-dark-surface-elevated border rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors ${variantClass}`}
    >
      {icon}
      {label}
    </button>
  );
}
