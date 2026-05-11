/**
 * Per-scope sessionStorage helpers for caching the active chat
 * conversation ID. Caching lets the panel reopen on the same
 * conversation across navigations without re-querying Supabase.
 *
 * @module hooks/useChat/sessionStorage
 */

function storageKey(scope: string, scopeId?: string): string {
  return `foresight:chat:${scope}:${scopeId || "global"}`;
}

export function persistConversationId(
  scope: string,
  scopeId: string | undefined,
  convId: string | null,
): void {
  const key = storageKey(scope, scopeId);
  try {
    if (convId) {
      sessionStorage.setItem(key, convId);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage unavailable (SSR, private browsing quota)
  }
}

export function restoreConversationId(
  scope: string,
  scopeId?: string,
): string | null {
  try {
    return sessionStorage.getItem(storageKey(scope, scopeId));
  } catch {
    return null;
  }
}
