/**
 * Coverage tab — pillar balance widget + per-workstream freshness table.
 * Operators use this to detect coverage drift and force ad-hoc workstream
 * scans when something has gone stale.
 *
 * @module pages/AdminConsole/tabs/CoverageTab
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";

import {
  type CoverageGapsResponse,
  type CoverageWindowDays,
  type PillarCoverageBucket,
  type PillarCoverageMode,
  type PillarCoverageResponse,
  type WorkstreamCoverageItem,
} from "../../../lib/admin-api";
import { CoverageGapHeatmap } from "../../../components/admin/CoverageGapHeatmap";
import { cn } from "../../../lib/utils";
import { formatDate, SectionHeader } from "../helpers";

const COVERAGE_WINDOWS: CoverageWindowDays[] = [7, 30, 90];
// Workstream "stale" threshold for the freshness widget. Anything beyond
// this many days (or never scanned) gets the warning treatment.
const STALE_THRESHOLD_DAYS = 7;
// Pre-computed in case the request comes back without `expected_share`
// (e.g. older payload during a deploy roll). Six pillars → 1/6 each.
const FALLBACK_EXPECTED_SHARE = 1 / 6;

const COVERAGE_MODES: ReadonlyArray<{
  value: PillarCoverageMode;
  label: string;
  description: string;
}> = [
  {
    value: "primary",
    label: "Primary",
    description: "Count each card under its primary pillar only.",
  },
  {
    value: "primary_or_secondary",
    label: "+ Secondary",
    description: "Also credit pillars listed in secondary_pillars.",
  },
  {
    value: "union",
    label: "+ CSP goals",
    description:
      "Also credit pillars reachable via csp_goal_ids — matches the CSP heatmap.",
  },
];

export function CoverageTab({
  pillarData,
  workstreams,
  gaps,
  loading,
  windowDays,
  mode,
  onWindowChange,
  onModeChange,
  onRefresh,
  onForceScan,
}: {
  pillarData: PillarCoverageResponse | null;
  workstreams: WorkstreamCoverageItem[];
  gaps: CoverageGapsResponse | null;
  loading: boolean;
  windowDays: CoverageWindowDays;
  mode: PillarCoverageMode;
  onWindowChange: (days: CoverageWindowDays) => void;
  onModeChange: (mode: PillarCoverageMode) => void;
  onRefresh: () => Promise<void>;
  onForceScan: (workstreamId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-8">
      <PillarBalanceWidget
        data={pillarData}
        windowDays={windowDays}
        mode={mode}
        onWindowChange={onWindowChange}
        onModeChange={onModeChange}
        loading={loading}
      />
      <CoverageGapsSection gaps={gaps} loading={loading} />
      <WorkstreamFreshnessTable
        items={workstreams}
        loading={loading}
        onRefresh={onRefresh}
        onForceScan={onForceScan}
      />
    </div>
  );
}

function CoverageGapsSection({
  gaps,
  loading,
}: {
  gaps: CoverageGapsResponse | null;
  loading: boolean;
}) {
  const description = gaps
    ? `Each CSP goal vs a uniform-distribution baseline of ${gaps.totals.expected_per_cell.toFixed(1)} cards. Goals more than 25% short of expected are amber; more than 50% short are red. ${gaps.totals.underrepresented_cells} of ${gaps.totals.goals} goals are currently underrepresented.`
    : "Each CSP goal vs a uniform-distribution baseline. Goals starved relative to peers are highlighted.";

  return (
    <section>
      <SectionHeader title="Coverage gaps" description={description} />
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface">
        {loading && !gaps ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading gaps…
          </div>
        ) : !gaps ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No data yet. Click Refresh after a discovery run completes.
          </p>
        ) : gaps.cells.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No CSP goals defined yet.
          </p>
        ) : (
          <CoverageGapHeatmap
            cells={gaps.cells}
            expectedPerCell={gaps.totals.expected_per_cell}
          />
        )}
      </div>
    </section>
  );
}

type Bucket = PillarCoverageBucket & { code: string };

function PillarBalanceWidget({
  data,
  windowDays,
  mode,
  onWindowChange,
  onModeChange,
  loading,
}: {
  data: PillarCoverageResponse | null;
  windowDays: CoverageWindowDays;
  mode: PillarCoverageMode;
  onWindowChange: (days: CoverageWindowDays) => void;
  onModeChange: (mode: PillarCoverageMode) => void;
  loading: boolean;
}) {
  const buckets = useMemo<Bucket[]>(() => {
    if (!data) return [];
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

  const activeMode = COVERAGE_MODES.find((m) => m.value === mode);
  return (
    <section>
      <SectionHeader
        title="Pillar balance"
        description={`Cards created per Austin strategic pillar over the selected window. Expected share is uniform across the six pillars (${(expectedShare * 100).toFixed(1)}% each). ${activeMode?.description ?? ""}`}
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
        <CoverageModeRadioGroup mode={mode} onModeChange={onModeChange} />
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
                  bucket={bucket}
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
  bucket,
  maxCards,
  expectedShare,
}: {
  bucket: Bucket;
  maxCards: number;
  expectedShare: number;
}) {
  const { code, name, cards, share, drift } = bucket;
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {code}
          </span>
          <ChannelBadges bucket={bucket} />
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

function ChannelBadges({ bucket }: { bucket: Bucket }) {
  // Per-channel counters render even in modes where they aren't driving the
  // bar height — they tell the operator that a pillar has secondary or CSP
  // representation they'd otherwise miss when staring at the primary bar.
  const channels: Array<[string, number, string]> = [
    ["P", bucket.primary_cards, "Primary pillar"],
    ["S", bucket.secondary_cards, "Listed in secondary_pillars"],
    ["C", bucket.csp_linked_cards, "Linked via csp_goal_ids"],
  ];
  return (
    <span className="flex items-center gap-1">
      {channels.map(([letter, count, label]) => (
        <span
          key={letter}
          title={`${label}: ${count}`}
          className={cn(
            "inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded border px-1 text-[10px] font-medium tabular-nums",
            count > 0
              ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
              : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-dark-surface-deep dark:text-gray-500",
          )}
        >
          {letter}
          {count > 0 ? `·${count}` : ""}
        </span>
      ))}
    </span>
  );
}

function CoverageModeRadioGroup({
  mode,
  onModeChange,
}: {
  mode: PillarCoverageMode;
  onModeChange: (mode: PillarCoverageMode) => void;
}) {
  // Roving-tabindex + arrow-key handling so the radio group is keyboard
  // accessible the way a native <input type="radio"> set would be. Without
  // these, only the focused button is reachable and arrow keys do nothing —
  // breaking expectations for screen-reader and keyboard-only operators.
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % COVERAGE_MODES.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + COVERAGE_MODES.length) % COVERAGE_MODES.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = COVERAGE_MODES.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = COVERAGE_MODES[nextIndex];
    if (!target) return;
    onModeChange(target.value);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className="mb-3 inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-xs dark:border-gray-600 dark:bg-dark-surface-deep"
      role="radiogroup"
      aria-label="Pillar coverage mode"
    >
      {COVERAGE_MODES.map((m, idx) => {
        const selected = mode === m.value;
        return (
          <button
            key={m.value}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={m.description}
            onClick={() => onModeChange(m.value)}
            onKeyDown={(event) => handleKeyDown(event, idx)}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              selected
                ? "bg-brand-blue text-white"
                : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-surface",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
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
