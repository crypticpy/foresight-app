/**
 * Quality-distribution counts + "How does Foresight work?" link strip.
 * Sits between the KPI tiles and the strategic-lens section.
 *
 * @module pages/Dashboard/QualityStrip
 */

import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import type { QualityDistribution } from "../../hooks/useDashboardData";

interface QualityStripProps {
  qualityDistribution: QualityDistribution;
}

export function QualityStrip({ qualityDistribution }: QualityStripProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400"
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          {qualityDistribution.high} High
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          {qualityDistribution.moderate} Moderate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          {qualityDistribution.low} Needs Verification
        </span>
      </div>
      <Link
        to="/methodology"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-blue dark:hover:text-brand-blue transition-colors"
      >
        <BookOpen className="h-4 w-4" />
        How does Foresight work?
      </Link>
    </div>
  );
}
