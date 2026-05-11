/**
 * Four-tile summary strip across the top of the Feeds page: total feeds,
 * active count, articles found, articles matched.
 *
 * @module pages/Feeds/SummaryStats
 */

interface SummaryStatsProps {
  total: number;
  activeCount: number;
  totalArticles: number;
  totalMatched: number;
}

export function SummaryStats({
  total,
  activeCount,
  totalArticles,
  totalMatched,
}: SummaryStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <Tile
        label="Total Feeds"
        value={total}
        valueClass="text-gray-900 dark:text-white"
      />
      <Tile
        label="Active"
        value={activeCount}
        valueClass="text-green-600 dark:text-green-400"
      />
      <Tile
        label="Articles Found"
        value={totalArticles.toLocaleString()}
        valueClass="text-gray-900 dark:text-white"
      />
      <Tile
        label="Matched"
        value={totalMatched.toLocaleString()}
        valueClass="text-brand-blue"
      />
    </div>
  );
}

interface TileProps {
  label: string;
  value: number | string;
  valueClass: string;
}

function Tile({ label, value, valueClass }: TileProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
