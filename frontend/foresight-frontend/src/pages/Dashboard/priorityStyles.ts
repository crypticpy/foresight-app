/**
 * Priority → Tailwind class lookups used by the Following Signals row.
 * Kept in one place so the three styling axes (badge color / left border /
 * gradient) stay consistent.
 *
 * @module pages/Dashboard/priorityStyles
 */

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  medium:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const PRIORITY_BORDERS: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-emerald-500",
};

const PRIORITY_GRADIENTS: Record<string, string> = {
  high: "from-red-50 dark:from-red-900/10",
  medium: "from-amber-50 dark:from-amber-900/10",
  low: "from-emerald-50 dark:from-emerald-900/10",
};

export function getPriorityColor(priority: string): string {
  return (
    PRIORITY_COLORS[priority] ||
    "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
  );
}

export function getPriorityBorder(priority: string): string {
  return PRIORITY_BORDERS[priority] || "border-l-gray-300";
}

export function getPriorityGradient(priority: string): string {
  return PRIORITY_GRADIENTS[priority] || "from-gray-50 dark:from-gray-800/50";
}
