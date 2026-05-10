/**
 * Step 1 of the wizard. Renders the Quick / Manual mode toggle and the
 * corresponding form fields:
 *
 *   - **Quick**: topic input, optional workstream select, AI-suggested
 *     keyword chips
 *   - **Manual**: name, description, pillar multi-select (with the
 *     "Exploratory" cross-cutting checkbox), horizon, stage, and seed URLs
 *
 * All state lives on the parent (see `useCreateSignalWizard`); this view
 * is purely a controlled-input shell.
 *
 * @module CreateSignal/components/DefineSignalStep
 */

import { Zap, PenTool, Sparkles, Loader2, X } from "lucide-react";
import { cn } from "../../../lib/utils";
import { SeedUrlInput } from "../SeedUrlInput";
import { HORIZON_OPTIONS, PILLAR_OPTIONS, STAGE_OPTIONS } from "../constants";
import type { WizardState, WorkstreamOption } from "../wizardState";

export interface DefineSignalStepProps {
  state: WizardState;
  updateState: (partial: Partial<WizardState>) => void;
  workstreams: WorkstreamOption[];
  loadingWorkstreams: boolean;
  isSuggestingKeywords: boolean;
  onSuggestKeywords: () => void;
  onRemoveKeyword: (keyword: string) => void;
  onTogglePillar: (code: string) => void;
  onExploratoryToggle: (checked: boolean) => void;
}

export function DefineSignalStep({
  state,
  updateState,
  workstreams,
  loadingWorkstreams,
  isSuggestingKeywords,
  onSuggestKeywords,
  onRemoveKeyword,
  onTogglePillar,
  onExploratoryToggle,
}: DefineSignalStepProps) {
  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div>
        <div
          className="flex rounded-lg bg-gray-100 dark:bg-dark-surface p-1"
          role="tablist"
          aria-label="Signal creation method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === "quick"}
            onClick={() => updateState({ mode: "quick" })}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-inset",
              state.mode === "quick"
                ? "bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
            )}
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            Quick Create
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === "manual"}
            onClick={() => updateState({ mode: "manual" })}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-inset",
              state.mode === "manual"
                ? "bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
            )}
          >
            <PenTool className="h-4 w-4" aria-hidden="true" />
            Manual Create
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
          {state.mode === "quick"
            ? "Enter a topic and let AI do the rest"
            : "Full control over all signal fields"}
        </p>
      </div>

      {state.mode === "quick" && (
        <div className="space-y-5">
          <div>
            <label
              htmlFor="quick-create-topic"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Topic or Signal Phrase
            </label>
            <input
              id="quick-create-topic"
              type="text"
              value={state.topic}
              onChange={(e) => updateState({ topic: e.target.value })}
              placeholder="e.g., forensics technology for law enforcement"
              className={cn(
                "w-full px-3 py-2.5 text-sm rounded-md border",
                "bg-white dark:bg-dark-surface",
                "text-gray-900 dark:text-gray-100",
                "placeholder-gray-400 dark:placeholder-gray-500",
                "border-gray-300 dark:border-gray-600",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
              )}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Describe a trend, technology, or emerging issue in a short phrase.
            </p>
          </div>

          <div>
            <label
              htmlFor="quick-create-workstream"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Workstream{" "}
              <span className="text-gray-400 dark:text-gray-500 font-normal">
                (optional)
              </span>
            </label>
            <select
              id="quick-create-workstream"
              value={state.workstreamId}
              onChange={(e) => updateState({ workstreamId: e.target.value })}
              disabled={loadingWorkstreams}
              className={cn(
                "w-full px-3 py-2.5 text-sm rounded-md border",
                "bg-white dark:bg-dark-surface",
                "text-gray-900 dark:text-gray-100",
                "border-gray-300 dark:border-gray-600",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <option value="">No workstream</option>
              {workstreams.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={onSuggestKeywords}
              disabled={!state.topic.trim() || isSuggestingKeywords}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md",
                "bg-white text-gray-700 border border-gray-300",
                "hover:bg-gray-50",
                "dark:bg-dark-surface-elevated dark:text-gray-300 dark:border-gray-600 dark:hover:bg-dark-surface-hover",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors duration-200",
              )}
            >
              {isSuggestingKeywords ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {isSuggestingKeywords ? "Suggesting..." : "Suggest Keywords"}
            </button>

            {state.keywords.length > 0 && (
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="list"
                aria-label="Suggested keywords"
              >
                {state.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    role="listitem"
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full",
                      "bg-blue-50 text-blue-700 border border-blue-200",
                      "dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
                      "text-xs font-medium",
                    )}
                  >
                    {keyword}
                    <button
                      type="button"
                      onClick={() => onRemoveKeyword(keyword)}
                      className={cn(
                        "p-0.5 rounded-full",
                        "text-blue-400 hover:text-blue-600 dark:hover:text-blue-200",
                        "hover:bg-blue-100 dark:hover:bg-blue-800",
                        "focus:outline-none focus:ring-1 focus:ring-blue-400",
                        "transition-colors duration-200",
                      )}
                      aria-label={`Remove keyword: ${keyword}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {state.mode === "manual" && (
        <div className="space-y-5">
          <div>
            <label
              htmlFor="manual-create-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Signal Name <span className="text-red-500">*</span>
            </label>
            <input
              id="manual-create-name"
              type="text"
              value={state.name}
              onChange={(e) => updateState({ name: e.target.value })}
              placeholder="e.g., AI-Powered Traffic Signal Optimization"
              className={cn(
                "w-full px-3 py-2.5 text-sm rounded-md border",
                "bg-white dark:bg-dark-surface",
                "text-gray-900 dark:text-gray-100",
                "placeholder-gray-400 dark:placeholder-gray-500",
                "border-gray-300 dark:border-gray-600",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
              )}
            />
          </div>

          <div>
            <label
              htmlFor="manual-create-description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="manual-create-description"
              value={state.description}
              onChange={(e) => updateState({ description: e.target.value })}
              placeholder="Describe the trend, technology, or emerging issue..."
              rows={3}
              className={cn(
                "w-full px-3 py-2.5 text-sm rounded-md border resize-y",
                "bg-white dark:bg-dark-surface",
                "text-gray-900 dark:text-gray-100",
                "placeholder-gray-400 dark:placeholder-gray-500",
                "border-gray-300 dark:border-gray-600",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Strategic Pillar(s)
            </label>

            <label
              className={cn(
                "inline-flex items-center gap-2 mb-3 cursor-pointer",
                "text-sm text-gray-700 dark:text-gray-300",
              )}
            >
              <input
                type="checkbox"
                checked={state.isExploratory}
                onChange={(e) => onExploratoryToggle(e.target.checked)}
                className={cn(
                  "h-4 w-4 rounded border-gray-300 dark:border-gray-600",
                  "text-violet-600 focus:ring-violet-500",
                )}
              />
              <span className="text-violet-700 dark:text-violet-400 font-medium">
                Exploratory
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (cross-cutting, not pillar-specific)
              </span>
            </label>

            {!state.isExploratory && (
              <div className="grid grid-cols-2 gap-2">
                {PILLAR_OPTIONS.map((pillar) => (
                  <label
                    key={pillar.code}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer",
                      "transition-colors duration-200",
                      state.selectedPillars.includes(pillar.code)
                        ? "bg-brand-blue/10 border-brand-blue text-brand-blue dark:bg-brand-blue/20 dark:border-brand-blue/60"
                        : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300",
                      "hover:border-brand-blue/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={state.selectedPillars.includes(pillar.code)}
                      onChange={() => onTogglePillar(pillar.code)}
                      className="sr-only"
                    />
                    <span className="text-xs font-mono font-bold">
                      {pillar.code}
                    </span>
                    <span className="text-sm">{pillar.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Horizon
            </label>
            <div
              className="flex gap-2"
              role="radiogroup"
              aria-label="Horizon selection"
            >
              {HORIZON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateState({ horizon: option.value })}
                  role="radio"
                  aria-checked={state.horizon === option.value}
                  className={cn(
                    "flex-1 px-3 py-2 text-sm font-medium rounded-md border",
                    "transition-colors duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
                    state.horizon === option.value
                      ? "bg-brand-blue text-white border-brand-blue"
                      : "bg-white dark:bg-dark-surface text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-blue/50",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="manual-create-stage"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Maturity Stage
            </label>
            <select
              id="manual-create-stage"
              value={state.stage}
              onChange={(e) => updateState({ stage: e.target.value })}
              className={cn(
                "w-full px-3 py-2.5 text-sm rounded-md border",
                "bg-white dark:bg-dark-surface",
                "text-gray-900 dark:text-gray-100",
                "border-gray-300 dark:border-gray-600",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
              )}
            >
              {STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <SeedUrlInput
            urls={state.seedUrls}
            onChange={(urls) => updateState({ seedUrls: urls })}
            max={10}
          />
        </div>
      )}
    </div>
  );
}
