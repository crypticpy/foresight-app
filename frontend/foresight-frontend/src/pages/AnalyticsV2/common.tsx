/**
 * Shared presentational primitives for the Analytics dashboard: stat tile,
 * trend chip, empty state, and the page-level loading skeleton.
 *
 * @module pages/AnalyticsV2/common
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: ReactNode;
  trend?: number | null;
  linkTo?: string;
  colorClass?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  linkTo,
  colorClass = "text-brand-blue",
}: StatCardProps) {
  const content = (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg group">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div
            className={`flex-shrink-0 ${colorClass} group-hover:scale-110 transition-transform`}
          >
            {icon}
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {trend !== undefined && trend !== null && (
          <div
            className={`flex items-center gap-1 text-sm font-medium ${
              trend > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : trend < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-500"
            }`}
          >
            {trend > 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : trend < 0 ? (
              <TrendingDown className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
            <span>
              {trend > 0 ? "+" : ""}
              {trend.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
  if (linkTo) return <Link to={linkTo}>{content}</Link>;
  return content;
}

export function TrendBadge({ trend }: { trend: string }) {
  if (trend === "up")
    return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (trend === "down")
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-gray-400" />;
}

interface EmptyStateProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
        {title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-dark-surface rounded-lg p-5 h-24"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-dark-surface rounded-lg p-6 h-64"
          >
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((j) => (
                <div
                  key={j}
                  className="h-8 bg-gray-200 dark:bg-gray-700 rounded"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
