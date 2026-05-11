/**
 * Coloured status pill for a discovery run (running / completed / failed /
 * cancelled). The running variant spins its icon.
 *
 * @module pages/DiscoveryHistory/StatusBadge
 */

import { CheckCircle, Loader2, StopCircle, XCircle } from "lucide-react";
import type { DiscoveryRun } from "../../lib/discovery-api";

const STATUS_CONFIG = {
  running: {
    icon: Loader2,
    text: "Running",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    iconClass: "animate-spin",
  },
  completed: {
    icon: CheckCircle,
    text: "Completed",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    iconClass: "",
  },
  failed: {
    icon: XCircle,
    text: "Failed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    iconClass: "",
  },
  cancelled: {
    icon: StopCircle,
    text: "Cancelled",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    iconClass: "",
  },
} as const;

interface StatusBadgeProps {
  status: DiscoveryRun["status"];
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.className}`}
    >
      <Icon className={`w-3.5 h-3.5 ${config.iconClass}`} />
      {config.text}
    </span>
  );
}
