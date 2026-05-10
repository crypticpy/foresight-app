/**
 * Compact three-step progress indicator for the Create Signal wizard.
 * Each circle shows step state (completed / current / upcoming); completed
 * steps are clickable to go back, future steps are not.
 *
 * @module CreateSignal/components/StepIndicator
 */

import React from "react";
import { Check } from "lucide-react";
import { cn } from "../../../lib/utils";
import { STEP_LABELS } from "../constants";
import type { WizardStep } from "../wizardState";

export interface StepIndicatorProps {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}

export function StepIndicator({
  currentStep,
  onStepClick,
}: StepIndicatorProps) {
  const steps: WizardStep[] = [1, 2, 3];

  return (
    <div className="flex items-center justify-between px-6 py-3">
      {steps.map((step, index) => {
        const isCompleted = step < currentStep;
        const isCurrent = step === currentStep;
        const isUpcoming = step > currentStep;
        const isClickable = step < currentStep;

        return (
          <React.Fragment key={step}>
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-2 group",
                isClickable ? "cursor-pointer" : "cursor-default",
              )}
              aria-label={`Step ${step}: ${STEP_LABELS[step]}${isCompleted ? " (completed)" : isCurrent ? " (current)" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold",
                  "transition-colors duration-200",
                  isCompleted && "bg-brand-blue text-white",
                  isCurrent &&
                    "bg-brand-blue text-white ring-2 ring-brand-blue/30 ring-offset-1 ring-offset-white dark:ring-offset-dark-surface-deep",
                  isUpcoming &&
                    "bg-gray-200 dark:bg-dark-surface-elevated text-gray-500 dark:text-gray-400",
                  isClickable &&
                    "group-hover:bg-brand-dark-blue group-hover:text-white",
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  step
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden sm:inline",
                  isCurrent
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400",
                  isClickable &&
                    "group-hover:text-gray-900 dark:group-hover:text-gray-100",
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 rounded-full",
                  step < currentStep
                    ? "bg-brand-blue"
                    : "bg-gray-200 dark:bg-dark-surface-elevated",
                )}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
