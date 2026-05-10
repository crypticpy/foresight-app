/**
 * Multi-step wizard for creating new intelligence signals. Composer that
 * wires together state (via {@link useCreateSignalWizard}), modal chrome
 * (Escape + Tab trap + body scroll lock), workstream-dropdown loading, and
 * the per-step view components. Renders the success view in place of the
 * wizard once a card has been created.
 *
 * Steps:
 *   1. **Define Signal** — Quick (topic) or Manual (full form)
 *   2. **Source Preferences** — categories, domains, custom RSS, keywords
 *   3. **Review & Create** — confirmation + research-depth option
 *
 * @example
 * ```tsx
 * <CreateSignalModal
 *   isOpen={open}
 *   onClose={() => setOpen(false)}
 *   workstreamId="ws-abc-123"
 * />
 * ```
 *
 * @module CreateSignal/CreateSignalModal
 */

import { useCallback, useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { SourcePreferencesStep } from "./SourcePreferencesStep";
import { StepIndicator } from "./components/StepIndicator";
import { DefineSignalStep } from "./components/DefineSignalStep";
import { ReviewStep } from "./components/ReviewStep";
import { WizardFooter } from "./components/WizardFooter";
import { WizardSuccessView } from "./components/WizardSuccessView";
import { useCreateSignalWizard } from "./hooks/useCreateSignalWizard";
import { useWorkstreamsList } from "./hooks/useWorkstreamsList";
import { useModalChrome } from "./hooks/useModalChrome";
import type { WizardStep } from "./wizardState";

export interface CreateSignalModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
  /** Optional pre-selected workstream id (seeds the dropdown). */
  workstreamId?: string;
  /** Fired after a signal is successfully created. */
  onSuccess?: () => void;
}

export function CreateSignalModal({
  isOpen,
  onClose,
  workstreamId,
  onSuccess,
}: CreateSignalModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const {
    state,
    updateState,
    goToStep,
    isStep1Valid,
    handleTogglePillar,
    handleExploratoryToggle,
    handleSuggestKeywords,
    handleRemoveKeyword,
    isSuggestingKeywords,
    handleCreate,
    isCreating,
    createdCard,
    error,
    resetForAnother,
  } = useCreateSignalWizard({ isOpen, workstreamId, onSuccess });

  const { workstreams, loadingWorkstreams } = useWorkstreamsList(isOpen);

  useModalChrome({ isOpen, onClose, modalRef });

  // Focus the close button on open
  useEffect(() => {
    if (isOpen && !createdCard) {
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [isOpen, createdCard]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  if (createdCard) {
    return (
      <WizardSuccessView
        isOpen={isOpen}
        onClose={onClose}
        createdCard={createdCard}
        researchDepth={state.researchDepth}
        onCreateAnother={resetForAnother}
      />
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center",
        "bg-black/50 dark:bg-black/70",
        "backdrop-blur-sm",
        "overflow-y-auto py-8 sm:py-16",
      )}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-signal-title"
    >
      <div
        ref={modalRef}
        className={cn(
          "relative w-full max-w-2xl mx-4",
          "bg-white dark:bg-dark-surface",
          "rounded-xl shadow-2xl",
          "border border-gray-200 dark:border-gray-700",
          "animate-in fade-in-0 zoom-in-95 duration-200",
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="create-signal-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Create Signal
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={cn(
              "p-1.5 rounded-md",
              "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
              "hover:bg-gray-100 dark:hover:bg-gray-700",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue",
              "transition-colors duration-200",
            )}
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <StepIndicator currentStep={state.step} onStepClick={goToStep} />
        <div className="border-b border-gray-200 dark:border-gray-700" />

        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          <div className="transition-opacity duration-200" key={state.step}>
            {state.step === 1 && (
              <DefineSignalStep
                state={state}
                updateState={updateState}
                workstreams={workstreams}
                loadingWorkstreams={loadingWorkstreams}
                isSuggestingKeywords={isSuggestingKeywords}
                onSuggestKeywords={handleSuggestKeywords}
                onRemoveKeyword={handleRemoveKeyword}
                onTogglePillar={handleTogglePillar}
                onExploratoryToggle={handleExploratoryToggle}
              />
            )}

            {state.step === 2 && (
              <SourcePreferencesStep
                value={state.sourcePreferences}
                onChange={(prefs) => updateState({ sourcePreferences: prefs })}
              />
            )}

            {state.step === 3 && (
              <ReviewStep
                state={state}
                workstreams={workstreams}
                onResearchDepthChange={(researchDepth) =>
                  updateState({ researchDepth })
                }
              />
            )}
          </div>
        </div>

        {error && (
          <div className="px-6 pb-2">
            <div
              className={cn(
                "flex items-start gap-2 px-3 py-2.5 rounded-md",
                "bg-red-50 dark:bg-red-900/20",
                "text-sm text-red-700 dark:text-red-400",
              )}
              role="alert"
            >
              <AlertTriangle
                className="h-4 w-4 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          </div>
        )}

        <WizardFooter
          step={state.step}
          isStep1Valid={isStep1Valid}
          isCreating={isCreating}
          onBack={() => goToStep((state.step - 1) as WizardStep)}
          onNext={() => goToStep((state.step + 1) as WizardStep)}
          onCreate={handleCreate}
        />
      </div>
    </div>
  );
}

export default CreateSignalModal;
