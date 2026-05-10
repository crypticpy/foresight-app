/**
 * Footer block that summarizes the current filter selection: live match
 * count, sample cards, validation/submit errors, and the zero-match
 * "Start Discovery Scan" prompt that appears immediately after create.
 *
 * @module components/WorkstreamForm/FilterPreview
 */

import { AlertCircle, Loader2, Radar, Search, Sparkles } from "lucide-react";

import { useWorkstreamForm } from "../../hooks/useWorkstreamForm";
import { cn } from "../../lib/utils";

type Form = ReturnType<typeof useWorkstreamForm>;

export interface FilterPreviewProps {
  form: Form;
  onCreatedWithZeroMatches?: (workstreamId: string) => void;
}

export function FilterPreview({
  form,
  onCreatedWithZeroMatches,
}: FilterPreviewProps) {
  return (
    <>
      {form.hasFilters && (
        <div
          className={cn(
            "rounded-lg p-4 border transition-all duration-200",
            form.preview && form.preview.estimated_count > 0
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
              : form.preview && form.preview.estimated_count === 0
                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700"
                : "bg-gray-50 dark:bg-dark-surface/50 border-gray-200 dark:border-gray-700",
          )}
        >
          <div className="flex items-center gap-3">
            {form.previewLoading ? (
              <>
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Searching for matching signals...
                </span>
              </>
            ) : form.preview ? (
              <>
                {form.preview.estimated_count > 0 ? (
                  <Search className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                )}
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-2xl font-bold",
                        form.preview.estimated_count > 0
                          ? "text-green-700 dark:text-green-300"
                          : "text-amber-700 dark:text-amber-300",
                      )}
                    >
                      ~{form.preview.estimated_count}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        form.preview.estimated_count > 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {form.preview.estimated_count === 1
                        ? "signal matches"
                        : "signals match"}{" "}
                      these filters
                    </span>
                  </div>
                  {form.preview.sample_cards.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Sample matches:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {form.preview.sample_cards.slice(0, 3).map((card) => (
                          <span
                            key={card.id}
                            className="text-xs px-2 py-0.5 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 truncate max-w-[200px]"
                            title={card.name}
                          >
                            {card.name}
                          </span>
                        ))}
                        {form.preview.estimated_count > 3 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            +{form.preview.estimated_count - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {form.preview.estimated_count === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Try broadening your filters or adding different keywords
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Add filters to see matching signals
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {form.errors.filters && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {form.errors.filters}
          </p>
        </div>
      )}

      {form.errors.submit && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">
            {form.errors.submit}
          </p>
        </div>
      )}

      {form.showZeroMatchPrompt && form.createdWorkstreamId && (
        <div className="rounded-lg p-4 border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <Radar className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                No existing signals match this topic.
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Would you like to discover new content?
              </p>
              <button
                type="button"
                onClick={() => {
                  if (onCreatedWithZeroMatches && form.createdWorkstreamId) {
                    onCreatedWithZeroMatches(form.createdWorkstreamId);
                  }
                  form.setShowZeroMatchPrompt(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Radar className="h-3.5 w-3.5" />
                Start Discovery Scan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
