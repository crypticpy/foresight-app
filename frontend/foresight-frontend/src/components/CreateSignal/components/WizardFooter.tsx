/**
 * The wizard's bottom button row: Back on the left, and a context-sensitive
 * Next/Create button on the right that swaps label and icon based on
 * `step`. Step 1's Next button respects `isStep1Valid`; Step 3's Create
 * button shows a spinner while `isCreating` is true.
 *
 * @module CreateSignal/components/WizardFooter
 */

import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { WizardStep } from "../wizardState";

export interface WizardFooterProps {
  step: WizardStep;
  isStep1Valid: boolean;
  isCreating: boolean;
  onBack: () => void;
  onNext: () => void;
  onCreate: () => void;
}

export function WizardFooter({
  step,
  isStep1Valid,
  isCreating,
  onBack,
  onNext,
  onCreate,
}: WizardFooterProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
      <div>
        {step > 1 && (
          <button
            type="button"
            onClick={onBack}
            disabled={isCreating}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md",
              "bg-white text-gray-700 border border-gray-300",
              "hover:bg-gray-50",
              "dark:bg-dark-surface-elevated dark:text-gray-300 dark:border-gray-600 dark:hover:bg-dark-surface-hover",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors duration-200",
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
        )}
      </div>

      <div>
        {step === 1 && (
          <button
            type="button"
            onClick={onNext}
            disabled={!isStep1Valid}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-md",
              "bg-brand-blue text-white hover:bg-brand-dark-blue",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors duration-200",
            )}
          >
            Next: Configure Sources
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {step === 2 && (
          <button
            type="button"
            onClick={onNext}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-md",
              "bg-brand-blue text-white hover:bg-brand-dark-blue",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
              "transition-colors duration-200",
            )}
          >
            Next: Review
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {step === 3 && (
          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md",
              "bg-brand-blue text-white hover:bg-brand-dark-blue",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors duration-200",
            )}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating Signal...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                Create Signal
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
