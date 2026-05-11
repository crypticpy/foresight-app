/**
 * Dashboard loading skeleton. Staggered fade-in via inline animation
 * delays so the rows appear top-down instead of all at once.
 *
 * @module pages/Dashboard/DashboardSkeleton
 */

import { Skeleton } from "../../components/dashboard/Skeleton";

export function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <div
          className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-9 w-72"
          style={{ animationDelay: "0ms" }}
        />
        <div
          className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-5 w-96 mt-2"
          style={{ animationDelay: "50ms" }}
        />
      </div>

      {/* Ask Foresight Bar skeleton */}
      <div
        className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-12 mb-8"
        style={{ animationDelay: "100ms" }}
      />

      {/* Stat cards skeleton — 5 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="rounded-xl h-32"
            style={{ animationDelay: `${150 + i * 50}ms` }}
          />
        ))}
      </div>

      {/* Quality distribution bar skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div
          className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-5 w-64"
          style={{ animationDelay: "400ms" }}
        />
        <div
          className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-5 w-48"
          style={{ animationDelay: "450ms" }}
        />
      </div>

      {/* Pattern Insights skeleton */}
      <div className="mb-8">
        <div
          className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-6 w-48 mb-4"
          style={{ animationDelay: "500ms" }}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-48"
              style={{ animationDelay: `${550 + i * 50}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Following Signals skeleton */}
      <div className="mb-8">
        <div
          className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-6 w-56 mb-4"
          style={{ animationDelay: "700ms" }}
        />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-24"
              style={{ animationDelay: `${750 + i * 50}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Recent Intelligence skeleton */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-6 w-48"
            style={{ animationDelay: "900ms" }}
          />
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-9 w-24"
            style={{ animationDelay: "950ms" }}
          />
        </div>
        <div className="grid gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-32"
              style={{ animationDelay: `${1000 + i * 50}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
