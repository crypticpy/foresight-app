/**
 * Slide-in bar shown when one or more cards are selected: bulk approve, bulk
 * reject, cancel. Disables action buttons while a bulk request is in flight.
 *
 * @module pages/DiscoveryQueue/BulkActionsBar
 */

import { CheckCircle, XCircle } from "lucide-react";
import type { ReviewAction } from "../../lib/discovery-api";

export interface BulkActionsBarProps {
  selectedCount: number;
  isMobile: boolean;
  /** True while a bulk request is being processed. */
  isProcessing: boolean;
  onAction: (action: ReviewAction) => void;
  onCancel: () => void;
}

export function BulkActionsBar({
  selectedCount,
  isMobile,
  isProcessing,
  onAction,
  onCancel,
}: BulkActionsBarProps) {
  return (
    <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-brand-light-blue dark:bg-brand-blue/20 border border-brand-blue/20 rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="text-sm font-medium text-brand-dark-blue dark:text-brand-light-blue">
          {selectedCount} card{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onAction("approve")}
            disabled={isProcessing}
            className="inline-flex items-center justify-center min-h-[44px] px-3 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors active:scale-95"
          >
            <CheckCircle className="h-4 w-4 sm:h-4 sm:w-4 mr-1.5 sm:mr-1.5" />
            {isMobile ? "Approve" : "Approve All"}
          </button>
          <button
            onClick={() => onAction("reject")}
            disabled={isProcessing}
            className="inline-flex items-center justify-center min-h-[44px] px-3 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors active:scale-95"
          >
            <XCircle className="h-4 w-4 sm:h-4 sm:w-4 mr-1.5 sm:mr-1.5" />
            {isMobile ? "Reject" : "Reject All"}
          </button>
          <button
            onClick={onCancel}
            className="inline-flex items-center justify-center min-h-[44px] px-3 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-95"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
