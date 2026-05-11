/**
 * Aggregate-stat tile used in the Discovery History header strip.
 *
 * @module pages/DiscoveryHistory/StatCard
 */

import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
}

export function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className={`p-4 rounded-lg border ${color}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-white dark:bg-dark-surface">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
