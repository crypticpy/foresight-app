/**
 * useKeywordSuggestions Hook
 *
 * Manages AI keyword suggestion state and fetching for workstream forms.
 * Accepts callbacks for getting topic context and auth tokens to remain
 * decoupled from form state management.
 */

import { useState, useCallback } from "react";
import { suggestKeywords } from "../lib/discovery-api";

export function useKeywordSuggestions(
  getTopicContext: () => {
    name: string;
    description: string;
    keywords: string[];
  },
  getAuthToken: () => Promise<string | null>,
) {
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [isSuggestingKeywords, setIsSuggestingKeywords] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const handleSuggestKeywords = useCallback(
    async (topicOverride?: string) => {
      const ctx = getTopicContext();
      const topic =
        topicOverride?.trim() || ctx.name.trim() || ctx.description.trim();
      if (!topic) return;

      setIsSuggestingKeywords(true);
      setSuggestedKeywords([]);
      setSuggestionError(null);
      try {
        const token = await getAuthToken();
        if (!token) {
          setSuggestionError("Not signed in");
          return;
        }
        const result = await suggestKeywords(topic, token);
        const newSuggestions = result.suggestions.filter(
          (kw) => !ctx.keywords.includes(kw),
        );
        setSuggestedKeywords(newSuggestions);
      } catch (error) {
        setSuggestionError(
          error instanceof Error ? error.message : "Failed to suggest keywords",
        );
      } finally {
        setIsSuggestingKeywords(false);
      }
    },
    [getTopicContext, getAuthToken],
  );

  const removeSuggestion = useCallback((keyword: string) => {
    setSuggestedKeywords((prev) => prev.filter((kw) => kw !== keyword));
  }, []);

  return {
    suggestedKeywords,
    isSuggestingKeywords,
    suggestionError,
    handleSuggestKeywords,
    removeSuggestion,
    setSuggestedKeywords,
  };
}
