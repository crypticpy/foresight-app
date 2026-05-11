/**
 * Mount-time restoration effect for the chat hook.
 *
 * Resolution order:
 *   1. forceNew=true → blank state + load suggestions + fun fact
 *   2. resolvedInitialId present (prop or sessionStorage) → load that
 *      conversation
 *   3. Query Supabase for the most recent conversation in the current
 *      scope; if none exists, fall back to suggestions + fun fact.
 *
 * @module hooks/useChat/useRestoreConversation
 */

import { useEffect } from "react";

import { fetchConversations } from "../../lib/chat-api";

import { loadFunFact } from "./funFact";

export interface RestoreConversationDeps {
  forceNew: boolean | undefined;
  resolvedInitialId: string | null;
  scope: string;
  scopeId: string | undefined;
  isMountedRef: React.RefObject<boolean>;
  loadConversation: (convId: string) => Promise<void>;
  loadSuggestions: () => Promise<void>;
  setFunFact: (fact: string | null) => void;
}

export function useRestoreConversation(deps: RestoreConversationDeps): void {
  // Intentionally runs once on mount. Restoration semantics are anchored
  // to the initial scope/id; remounting on a new scope is the consumer's
  // responsibility (via key prop on ChatPanel).
  useEffect(() => {
    let cancelled = false;
    const isStillMounted = () =>
      !cancelled && (deps.isMountedRef.current ?? false);

    const showSuggestionsAndFact = () => {
      deps.loadSuggestions();
      loadFunFact(deps.setFunFact, isStillMounted);
    };

    async function restore() {
      if (deps.forceNew) {
        showSuggestionsAndFact();
        return;
      }

      if (deps.resolvedInitialId) {
        await deps.loadConversation(deps.resolvedInitialId);
        return;
      }

      try {
        const conversations = await fetchConversations({
          scope: deps.scope,
          scope_id: deps.scopeId,
          limit: 1,
        });
        if (!isStillMounted()) return;

        const first = conversations[0];
        if (first) {
          await deps.loadConversation(first.id);
        } else {
          showSuggestionsAndFact();
        }
      } catch {
        if (isStillMounted()) showSuggestionsAndFact();
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
