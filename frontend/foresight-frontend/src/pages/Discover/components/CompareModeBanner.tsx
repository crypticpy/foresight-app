/**
 * Banner shown when the user is in Compare Mode. Reflects the selection
 * progress (0/1/2 cards), offers Clear / Compare Signals / Exit actions, and
 * lists the currently-selected cards as chips.
 *
 * @module pages/Discover/components/CompareModeBanner
 */

import { ArrowLeftRight, X } from "lucide-react";
import type { CompareCard } from "../hooks/useCompareMode";

export interface CompareModeBannerProps {
  selectedForCompare: CompareCard[];
  onClearSelection: () => void;
  onNavigateToCompare: () => void;
  onExitCompareMode: () => void;
  onToggleCardForCompare: (card: CompareCard) => void;
}

export function CompareModeBanner({
  selectedForCompare,
  onClearSelection,
  onNavigateToCompare,
  onExitCompareMode,
  onToggleCardForCompare,
}: CompareModeBannerProps) {
  return (
    <div className="mb-6 p-4 bg-extended-purple/10 border border-extended-purple/30 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-5 w-5 text-extended-purple" />
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              Compare Mode Active
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {selectedForCompare.length === 0
                ? "Click on signals to select them for comparison (max 2)"
                : selectedForCompare.length === 1
                  ? `Selected: ${selectedForCompare[0]?.name ?? "signal"} — Click another signal to compare`
                  : `Ready to compare: ${selectedForCompare[0]?.name ?? "signal"} vs ${selectedForCompare[1]?.name ?? "signal"}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedForCompare.length > 0 && (
            <button
              onClick={onClearSelection}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900"
            >
              Clear Selection
            </button>
          )}
          <button
            onClick={onNavigateToCompare}
            disabled={selectedForCompare.length !== 2}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-extended-purple text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-extended-purple/90 transition-colors"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Compare Signals
          </button>
          <button
            onClick={onExitCompareMode}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {selectedForCompare.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {selectedForCompare.map((card, index) => (
            <span
              key={card.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-dark-surface rounded-full text-sm border border-extended-purple/30"
            >
              <span className="font-medium text-extended-purple">
                {index + 1}.
              </span>
              <span className="text-gray-700 dark:text-gray-200 truncate max-w-[200px]">
                {card.name}
              </span>
              <button
                onClick={() => onToggleCardForCompare(card)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
