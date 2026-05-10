/**
 * Inner body of a pending-card row: select checkbox, name + badge cluster,
 * discovered-at timestamp, summary, and action buttons (approve/edit/reject
 * + dismiss-reason dropdown). Lives inside a `SwipeableCard` that owns the
 * outer container styling and gesture handling.
 *
 * @module pages/DiscoveryQueue/PendingCardRow
 */

import { Link } from "react-router-dom";
import {
  CheckCircle,
  Clock,
  Edit3,
  MoreHorizontal,
  XCircle,
} from "lucide-react";
import { PillarBadge } from "../../components/PillarBadge";
import { HorizonBadge } from "../../components/HorizonBadge";
import { StageBadge } from "../../components/StageBadge";
import { ConfidenceBadge } from "../../components/ConfidenceBadge";
import { parseStageNumber } from "../../lib/stage-utils";
import type {
  DismissReason,
  PendingCard,
  ReviewAction,
} from "../../lib/discovery-api";
import { ImpactScoreBadge } from "./ImpactScoreBadge";
import { formatDiscoveredDate } from "./utils";

export interface PendingCardRowProps {
  card: PendingCard;
  isMobile: boolean;
  isSelected: boolean;
  isLoading: boolean;
  isDropdownOpen: boolean;
  onToggleSelect: (cardId: string) => void;
  onOpenDropdown: (cardId: string | null) => void;
  onReview: (cardId: string, action: ReviewAction) => void;
  onDismiss: (cardId: string, reason?: DismissReason) => void;
}

export function PendingCardRow({
  card,
  isMobile,
  isSelected,
  isLoading,
  isDropdownOpen,
  onToggleSelect,
  onOpenDropdown,
  onReview,
  onDismiss,
}: PendingCardRowProps) {
  const stageNumber = parseStageNumber(card.stage_id);

  return (
    <div className="flex items-start gap-2 sm:gap-4">
      <label
        className="flex-shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 cursor-pointer"
        aria-label={`Select ${card.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(card.id)}
          className="h-5 w-5 sm:h-4 sm:w-4 text-brand-blue border-gray-300 dark:border-gray-600 rounded focus:ring-brand-blue cursor-pointer"
        />
      </label>

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-2 sm:mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white line-clamp-2 sm:line-clamp-none">
              {card.name}
            </h3>
            <div className="mt-1.5 sm:mt-2 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap sm:flex-wrap min-w-max sm:min-w-0">
                <PillarBadge
                  pillarId={card.pillar_id}
                  showIcon={!isMobile}
                  size="sm"
                />
                <HorizonBadge horizon={card.horizon} size="sm" />
                {stageNumber !== null && (
                  <StageBadge stage={stageNumber} size="sm" variant="minimal" />
                )}
                <ConfidenceBadge confidence={card.ai_confidence} size="sm" />
                <ImpactScoreBadge score={card.impact_score} size="sm" />
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0 sm:text-right text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatDiscoveredDate(card.discovered_at)}</span>
            </div>
            {card.source_type && (
              <span className="sm:mt-1 text-gray-400 dark:text-gray-500">
                via {card.source_type}
              </span>
            )}
          </div>
        </div>

        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-3 sm:mb-4 line-clamp-2">
          {card.summary}
        </p>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReview(card.id, "approve");
            }}
            disabled={isLoading}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 sm:px-3 py-2 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors active:scale-95"
            title="Approve this signal"
          >
            <CheckCircle className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-1.5" />
            <span className="hidden sm:inline ml-1.5">Approve</span>
          </button>

          <Link
            to={`/signals/${card.slug}?mode=edit`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 sm:px-3 py-2 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors active:scale-95"
            title="Edit and approve"
          >
            <Edit3 className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-1.5" />
            <span className="hidden sm:inline ml-1.5">Edit</span>
          </Link>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(card.id, "irrelevant");
            }}
            disabled={isLoading}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 sm:px-3 py-2 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors active:scale-95"
            title="Reject this card"
          >
            <XCircle className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-1.5" />
            <span className="hidden sm:inline ml-1.5">Reject</span>
          </button>

          <div className="relative ml-auto sm:ml-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDropdown(isDropdownOpen ? null : card.id);
              }}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-95"
              title="More options"
              aria-label="More options"
            >
              <MoreHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-1 w-48 sm:w-48 bg-white dark:bg-dark-surface-elevated rounded-md shadow-lg border border-gray-200 dark:border-gray-600 py-1 z-10">
                <DropdownItem
                  label="Mark as Duplicate"
                  onClick={() => onDismiss(card.id, "duplicate")}
                />
                <DropdownItem
                  label="Out of Scope"
                  onClick={() => onDismiss(card.id, "out_of_scope")}
                />
                <DropdownItem
                  label="Low Quality"
                  onClick={() => onDismiss(card.id, "low_quality")}
                />
                <DropdownItem
                  label="Defer for Later"
                  onClick={() => onReview(card.id, "defer")}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DropdownItemProps {
  label: string;
  onClick: () => void;
}

function DropdownItem({ label, onClick }: DropdownItemProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-full min-h-[44px] sm:min-h-0 px-4 py-3 sm:py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 active:bg-gray-200 dark:active:bg-gray-500"
    >
      {label}
    </button>
  );
}
