/**
 * Pure helpers for the AskForesight page: bucketing conversations into
 * Today/This Week/Older, formatting relative timestamps, and choosing
 * pill styles for the scope badge.
 *
 * @module pages/AskForesight/utils
 */

import type { Conversation } from "../../lib/chat-api";

/** Groups conversations into "Today", "This Week", and "Older" buckets. */
export function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const today: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conv of conversations) {
    const updatedAt = new Date(conv.updated_at);
    if (updatedAt >= startOfToday) {
      today.push(conv);
    } else if (updatedAt >= startOfWeek) {
      thisWeek.push(conv);
    } else {
      older.push(conv);
    }
  }

  return { today, thisWeek, older };
}

/** Returns a human-friendly relative time string. */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Returns the pill color classes for a scope type. */
export function scopeBadgeClasses(scope: Conversation["scope"]): string {
  switch (scope) {
    case "signal":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "workstream":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    case "global":
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  }
}

/** Label for scope badge pill. */
export function scopeLabel(scope: Conversation["scope"]): string {
  switch (scope) {
    case "signal":
      return "Signal";
    case "workstream":
      return "Workstream";
    case "global":
    default:
      return "Global";
  }
}

export interface ScopeOption {
  label: string;
  scope: "global" | "workstream";
  scopeId?: string;
}

export type Workstream = { id: string; name: string };
