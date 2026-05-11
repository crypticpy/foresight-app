/**
 * Keyword chips, add-keyword input, and the AI "Suggest Related Terms"
 * affordance. All keyword state (input value, suggestion fetch flag,
 * accepted list) lives on `useWorkstreamForm`.
 *
 * @module components/WorkstreamForm/KeywordsSection
 */

import { Loader2, Plus, Wand2 } from "lucide-react";

import { useWorkstreamForm } from "../../hooks/useWorkstreamForm";
import { cn } from "../../lib/utils";
import { FormSection } from "../workstream/FormSection";
import { KeywordTag } from "../workstream/KeywordTag";

type Form = ReturnType<typeof useWorkstreamForm>;

export interface KeywordsSectionProps {
  form: Form;
}

export function KeywordsSection({ form }: KeywordsSectionProps) {
  const suggestDisabled =
    form.isSuggestingKeywords ||
    (!form.keywordInput.trim() &&
      !form.formData.name.trim() &&
      !form.formData.description.trim());

  return (
    <FormSection
      title="Keywords"
      description="Add keywords to match against signal content (press Enter or comma to add)"
    >
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={form.keywordInput}
            onChange={(e) => form.setKeywordInput(e.target.value)}
            onKeyDown={form.handleKeywordInputKeyDown}
            placeholder="Type a keyword and press Enter..."
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue bg-white dark:bg-dark-surface-elevated dark:text-white dark:placeholder-gray-400"
          />
          <button
            type="button"
            onClick={form.handleKeywordAdd}
            disabled={!form.keywordInput.trim()}
            className={cn(
              "px-3 py-2 text-sm font-medium rounded-md border transition-colors",
              form.keywordInput.trim()
                ? "bg-brand-blue border-brand-blue text-white hover:bg-brand-dark-blue"
                : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400 cursor-not-allowed",
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {form.formData.keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.formData.keywords.map((keyword) => (
              <KeywordTag
                key={keyword}
                keyword={keyword}
                onRemove={() => form.handleKeywordRemove(keyword)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={form.handleSuggestKeywords}
            disabled={suggestDisabled}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
              suggestDisabled
                ? "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40",
            )}
          >
            {form.isSuggestingKeywords ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {form.isSuggestingKeywords
              ? "Suggesting..."
              : "Suggest Related Terms"}
          </button>
        </div>

        {form.suggestedKeywords.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Click to add suggested terms:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {form.suggestedKeywords.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => form.handleAddSuggestedKeyword(kw)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-dashed border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {kw}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </FormSection>
  );
}
