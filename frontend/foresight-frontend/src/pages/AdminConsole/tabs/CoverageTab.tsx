/**
 * Coverage tab — pillar balance widget + per-workstream freshness table.
 * Operators use this to detect coverage drift and force ad-hoc workstream
 * scans when something has gone stale.
 *
 * @module pages/AdminConsole/tabs/CoverageTab
 */

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";

import {
  type CoverageWindowDays,
  type PillarCoverageResponse,
  type WorkstreamCoverageItem,
} from "../../../lib/admin-api";
import { cn } from "../../../lib/utils";
import { formatDate, SectionHeader } from "../helpers";

const COVERAGE_WINDOWS: CoverageWindowDays[] = [7, 30, 90];
// Workstream "stale" threshold for the freshness widget. Anything beyond
// this many days (or never scanned) gets the warning treatment.
const STALE_THRESHOLD_DAYS = 7;
// Pre-computed in case the request comes back without `expected_share`
// (e.g. older payload during a deploy roll). Six pillars → 1/6 each.
const FALLBACK_EXPECTED_SHARE = 1 / 6;

export function CoverageTab({
  pillarData,
  workstreams,
  loading,
  windowDays,
  onWindowChange,
  onRefresh,
  onForceScan,
}: {
  pillarData: PillarCoverageResponse | null;
  workstreams: WorkstreamCoverageItem[];
  loading: boolean;
  windowDays: CoverageWindowDays;
  onWindowChange: (days: CoverageWindowDays) => void;
  onRefresh: () => Promise<void>;
  onForceScan: (workstreamId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-8">
      <PillarBalanceWidget
        data={pillarData}
        windowDays={windowDays}
        onWindowChange={onWindowChange}
        loading={loading}
      />
      <WorkstreamFreshnessTable
        items={workstreams}
        loading={loading}
        onRefresh={onRefresh}
        onForceScan={onForceScan}
      />
    </div>
  );
}

function PillarBalanceWidget({
  data,
  windowDays,
  onWindowChange,
  loading,
}: {
  data: PillarCoverageResponse | null;
  windowDays: CoverageWindowDays;
  onWindowChange: (days: CoverageWindowDays) => void;
  loading: boolean;
}) {
  const buckets = useMemo(() => {
    if (!data)
      return [] as Array<{
        code: string;
        name: string;
        cards: number;
        share: number;
        drift: number;
      }>;
    return Object.entries(data.by_pillar).map(([code, bucket]) => ({
      code,
      ...bucket,
    }));
  }, [data]);

  // Bar widths are normalized against the largest bucket so a low-volume
  // window still produces a visible chart. Falls back to share when every
  // bucket is zero (loading / fresh-install case).
  const maxCards = useMemo(
    () => buckets.reduce((acc, b) => Math.max(acc, b.cards), 0),
    [buckets],
  );

  const expectedShare =
    data?.by_pillar.CH?.expected_share ?? FALLBACK_EXPECTED_SHARE;

  return (
    <section>
      <SectionHeader
        title="Pillar balance"
        description={`Cards created per Austin strategic pillar over the selected window. Expected share is uniform across the six pillars (${(expectedShare * 100).toFixed(1)}% each).`}
        action={
          <div className="flex items-center gap-2">
            {COVERAGE_WINDOWS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onWindowChange(days)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  windowDays === days
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200",
                )}
              >
                {days}d
              </button>
            ))}
          </div>
        }
      />
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface">
        {loading && !data ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading coverage…
          </div>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No data yet. Click Refresh after a discovery run completes.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {data.total} cards in window
                {data.unassigned > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    ({data.unassigned} unassigned)
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-400">
                since {formatDate(data.since)}
              </span>
            </div>
            <ul className="space-y-2">
              {buckets.map((bucket) => (
                <PillarBar
                  key={bucket.code}
                  code={bucket.code}
                  name={bucket.name}
                  cards={bucket.cards}
                  share={bucket.share}
                  drift={bucket.drift}
                  maxCards={maxCards}
                  expectedShare={expectedShare}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function PillarBar({
  code,
  name,
  cards,
  share,
  drift,
  maxCards,
  expectedShare,
}: {
  code: string;
  name: string;
  cards: number;
  share: number;
  drift: number;
  maxCards: number;
  expectedShare: number;
}) {
  // Use share-relative bar so 0 cards still renders a baseline line at the
  // expected-share mark rather than collapsing to nothing visible.
  const widthPct = maxCards > 0 ? (cards / maxCards) * 100 : 0;
  const baselinePct = maxCards > 0 ? Math.min(100, expectedShare * 100) : 0;
  // Drift > 5pp colored; otherwise neutral. Keeps the chart readable.
  const driftClass =
    drift >= 0.05
      ? "text-emerald-600 dark:text-emerald-400"
      : drift <= -0.05
        ? "text-amber-600 dark:text-amber-400"
        : "text-gray-500 dark:text-gray-400";
  return (
    <li className="flex items-center gap-3">
      <div className="w-44 shrink-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {code}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{name}</div>
      </div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-dark-surface-deep">
        <div
          className="h-full bg-brand-blue/80"
          style={{ width: `${widthPct}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-gray-500/60"
          style={{ left: `${baselinePct}%` }}
          title={`Expected share ${(expectedShare * 100).toFixed(1)}%`}
        />
      </div>
      <div className="w-32 shrink-0 text-right text-xs">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {cards} ({(share * 100).toFixed(1)}%)
        </div>
        <div className={driftClass}>
          {drift >= 0 ? "+" : ""}
          {(drift * 100).toFixed(1)}pp
        </div>
      </div>
    </li>
  );
}

function WorkstreamFreshnessTable({
  items,
  loading,
  onRefresh,
  onForceScan,
}: {
  items: WorkstreamCoverageItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onForceScan: (workstreamId: string) => Promise<void>;
}) {
  const [scanning, setScanning] = useState<string | null>(null);

  const handleScan = useCallback(
    async (workstreamId: string) => {
      setScanning(workstreamId);
      try {
        await onForceScan(workstreamId);
      } finally {
        setScanning(null);
      }
    },
    [onForceScan],
  );

  return (
    <section>
      <SectionHeader
        title="Workstream freshness"
        description="Workstreams sorted stale-first. Force scan enqueues a targeted run; the worker picks it up on the next tick."
        action={
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        }
      />
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-dark-surface-deep">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-2">Workstream</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Last scan</th>
              <th className="px-4 py-2">Scans 30d</th>
              <th className="px-4 py-2">Cards 30d</th>
              <th className="px-4 py-2">Auto-scan</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-dark-surface">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  {loading ? "Loading workstreams…" : "No workstreams to show."}
                </td>
              </tr>
            ) : (
              items.map((ws) => (
                <FreshnessRow
                  key={ws.id}
                  ws={ws}
                  scanning={scanning === ws.id}
                  onScan={() => handleScan(ws.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FreshnessRow({
  ws,
  scanning,
  onScan,
}: {
  ws: WorkstreamCoverageItem;
  scanning: boolean;
  onScan: () => void;
}) {
  const isStale = useMemo(() => {
    if (!ws.last_scanned_at) return true;
    const last = new Date(ws.last_scanned_at).getTime();
    if (Number.isNaN(last)) return true;
    const ageDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return ageDays > STALE_THRESHOLD_DAYS;
  }, [ws.last_scanned_at]);

  return (
    <tr className={cn(isStale && "bg-amber-50/40 dark:bg-amber-900/10")}>
      <td className="px-4 py-2">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {ws.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {ws.id.slice(0, 8)}
        </div>
      </td>
      <td className="px-4 py-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            ws.owner_type === "org"
              ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
              : "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-dark-surface-deep dark:text-gray-300",
          )}
        >
          {ws.owner_type}
        </span>
      </td>
      <td className="px-4 py-2">
        {ws.last_scanned_at ? (
          <div className="flex items-center gap-2">
            {isStale && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            <span className="text-gray-700 dark:text-gray-200">
              {formatDate(ws.last_scanned_at)}
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Never
          </span>
        )}
      </td>
      <td className="px-4 py-2 tabular-nums text-gray-700 dark:text-gray-200">
        {ws.scans_30d}
      </td>
      <td className="px-4 py-2 tabular-nums text-gray-700 dark:text-gray-200">
        {ws.cards_added_30d}
      </td>
      <td className="px-4 py-2">
        {ws.auto_scan ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <span className="text-xs text-gray-400">off</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <button
          type="button"
          onClick={onScan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          Force scan
        </button>
      </td>
    </tr>
  );
}
