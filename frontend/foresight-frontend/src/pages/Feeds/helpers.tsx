/**
 * Presentational helpers for the Feeds page: status icon, category colour
 * mapping, triage colour, relative-time formatter.
 *
 * @module pages/Feeds/helpers
 */

import { AlertCircle, CheckCircle2, Clock, PauseCircle } from "lucide-react";
import { FEED_CATEGORIES } from "./constants";

export { formatRelativeTime } from "../../lib/utils";

const DEFAULT_CATEGORY_COLOR =
  "bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300";

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    gov_tech:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    municipal:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    academic:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    news: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    think_tank:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    tech: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
    general: DEFAULT_CATEGORY_COLOR,
  };
  return colors[category] ?? DEFAULT_CATEGORY_COLOR;
}

export function getCategoryLabel(value: string): string {
  const cat = FEED_CATEGORIES.find((c) => c.value === value);
  return cat ? cat.label : value;
}

export function getStatusIcon(status: string) {
  switch (status) {
    case "active":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "paused":
      return <PauseCircle className="w-4 h-4 text-yellow-500" />;
    case "error":
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

export function getTriageColor(result: string | null): string {
  switch (result) {
    case "matched":
      return "text-green-600 dark:text-green-400";
    case "pending":
      return "text-yellow-600 dark:text-yellow-400";
    case "irrelevant":
      return "text-gray-400 dark:text-gray-500";
    default:
      return "text-gray-500 dark:text-gray-400";
  }
}
