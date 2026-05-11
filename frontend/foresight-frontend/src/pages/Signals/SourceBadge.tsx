/**
 * Tiny coloured badge used on signal cards and list rows to indicate which
 * personal source a signal belongs to (followed / created / workstream).
 *
 * @module pages/Signals/SourceBadge
 */

import { Eye, Layers, PenTool } from "lucide-react";

interface SourceBadgeProps {
  type: "followed" | "created" | "workstream";
  label?: string;
}

const CONFIGS = {
  followed: {
    icon: Eye,
    text: "Followed",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  },
  created: {
    icon: PenTool,
    text: "Created",
    className:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  },
  workstream: {
    icon: Layers,
    text: "Workstream",
    className:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  },
} as const;

export function SourceBadge({ type, label }: SourceBadgeProps) {
  const config = CONFIGS[type];
  const Icon = config.icon;
  const text = type === "workstream" ? label || config.text : config.text;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${config.className}`}
    >
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}
