/**
 * Shared helpers for the AdminConsole — tab metadata, token helper,
 * value formatters, and small presentational primitives reused across
 * every tab.
 *
 * @module pages/AdminConsole/helpers
 */

import React from "react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Database,
  FileStack,
  Gauge,
  History,
  MessageSquareText,
  Rss,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { getAuthToken } from "../../lib/auth";
import { cn } from "../../lib/utils";

export type AdminTab =
  | "overview"
  | "users"
  | "operations"
  | "settings"
  | "sources"
  | "schedules"
  | "templates"
  | "coverage"
  | "usage"
  | "llm_activity"
  | "audit"
  | "safety";

export const tabs: Array<{
  id: AdminTab;
  label: string;
  icon: React.ElementType;
}> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "operations", label: "Operations", icon: Activity },
  { id: "settings", label: "Models & Chat", icon: SlidersHorizontal },
  { id: "sources", label: "Sources", icon: Rss },
  { id: "schedules", label: "Schedules", icon: CalendarClock },
  { id: "templates", label: "Templates", icon: FileStack },
  { id: "coverage", label: "Coverage", icon: Gauge },
  { id: "usage", label: "Usage", icon: Database },
  { id: "llm_activity", label: "LLM activity", icon: MessageSquareText },
  { id: "audit", label: "Audit log", icon: History },
  { id: "safety", label: "Safety", icon: Shield },
];

export async function getToken(): Promise<string> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return token;
}

export function formatDate(value?: unknown): string {
  if (!value || typeof value !== "string") return "n/a";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function formatMoney(value?: number): string {
  return `$${(value || 0).toFixed(4)}`;
}

export function StatusPill({ status }: { status?: unknown }) {
  const text = String(status || "unknown");
  const className =
    text === "completed" || text === "healthy" || text === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
      : text === "queued" ||
          text === "running" ||
          text === "processing" ||
          text === "started"
        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800"
        : text === "failed" || text === "error"
          ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
          : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-dark-surface">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
            {value}
          </div>
          {subtext && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtext}
            </p>
          )}
        </div>
        <div className="rounded-md bg-brand-blue/10 p-2 text-brand-blue">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
