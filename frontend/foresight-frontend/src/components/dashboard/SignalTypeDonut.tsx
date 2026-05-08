/**
 * SignalTypeDonut — fixed-bucket donut for the signal-type mix.
 *
 * Always renders the same four ordered slices (trend / driver / signal /
 * unclassified) so the chart's geometry is stable as the corpus grows.
 * Each slice is a pure SVG arc — no chart library.
 *
 * When the corpus is empty the chart shows the four ring outlines plus an
 * "All unclassified" caption rather than collapsing to nothing.
 */

import { useMemo } from "react";
import { cn } from "../../lib/utils";
import type { SignalTypeBucket, SignalTypeMix } from "../../types/dashboard";

export interface SignalTypeDonutProps {
  data: SignalTypeMix[];
  className?: string;
  size?: number;
}

const BUCKET_ORDER: SignalTypeBucket[] = [
  "trend",
  "driver",
  "signal",
  "unclassified",
];

const BUCKET_LABEL: Record<SignalTypeBucket, string> = {
  trend: "Trend",
  driver: "Driver",
  signal: "Signal",
  unclassified: "Unclassified",
};

const BUCKET_COLOR: Record<SignalTypeBucket, string> = {
  trend: "#44499C",
  driver: "#009F4D",
  signal: "#FF8F00",
  unclassified: "#94A3B8",
};

const RADIUS = 38;
const INNER_RADIUS = 22;
const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;

interface SliceGeometry {
  bucket: SignalTypeBucket;
  count: number;
  color: string;
  d: string;
  /** True when this slice covers ≥ the entire ring (i.e. only-bucket case). */
  isFullRing: boolean;
}

function arcPath(startRad: number, endRad: number): string {
  const x1 = CENTER + RADIUS * Math.cos(startRad);
  const y1 = CENTER + RADIUS * Math.sin(startRad);
  const x2 = CENTER + RADIUS * Math.cos(endRad);
  const y2 = CENTER + RADIUS * Math.sin(endRad);
  const x3 = CENTER + INNER_RADIUS * Math.cos(endRad);
  const y3 = CENTER + INNER_RADIUS * Math.sin(endRad);
  const x4 = CENTER + INNER_RADIUS * Math.cos(startRad);
  const y4 = CENTER + INNER_RADIUS * Math.sin(startRad);
  const largeArc = endRad - startRad > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function fullRingPath(): string {
  // Two semicircles glued together — SVG has no built-in donut primitive.
  const left = CENTER - RADIUS;
  const right = CENTER + RADIUS;
  const innerLeft = CENTER - INNER_RADIUS;
  const innerRight = CENTER + INNER_RADIUS;
  return [
    `M ${left} ${CENTER}`,
    `A ${RADIUS} ${RADIUS} 0 1 1 ${right} ${CENTER}`,
    `A ${RADIUS} ${RADIUS} 0 1 1 ${left} ${CENTER}`,
    `M ${innerLeft} ${CENTER}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${innerRight} ${CENTER}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${innerLeft} ${CENTER}`,
    "Z",
  ].join(" ");
}

function buildSlices(data: SignalTypeMix[]): {
  slices: SliceGeometry[];
  total: number;
} {
  const counts = new Map<SignalTypeBucket, number>();
  for (const bucket of BUCKET_ORDER) counts.set(bucket, 0);
  for (const row of data) {
    if (BUCKET_ORDER.includes(row.signal_type)) {
      counts.set(
        row.signal_type,
        (counts.get(row.signal_type) ?? 0) + row.count,
      );
    }
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return { slices: [], total: 0 };
  }

  const slices: SliceGeometry[] = [];
  let cursor = -Math.PI / 2;
  for (const bucket of BUCKET_ORDER) {
    const count = counts.get(bucket) ?? 0;
    if (count === 0) continue;
    const sweep = (count / total) * 2 * Math.PI;
    const isFullRing = count === total;
    const d = isFullRing ? fullRingPath() : arcPath(cursor, cursor + sweep);
    slices.push({
      bucket,
      count,
      color: BUCKET_COLOR[bucket],
      d,
      isFullRing,
    });
    cursor += sweep;
  }
  return { slices, total };
}

export function SignalTypeDonut({
  data,
  className,
  size = 160,
}: SignalTypeDonutProps) {
  const { slices, total } = useMemo(() => buildSlices(data), [data]);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        width={size}
        height={size}
        role="img"
        aria-label={
          total === 0
            ? "Signal type donut: no cards classified yet."
            : `Signal type mix across ${total} cards.`
        }
        className="flex-shrink-0"
      >
        {/* Background ring — visible when there's no data, else hidden under slices. */}
        <path
          d={fullRingPath()}
          fill="currentColor"
          className="text-gray-200 dark:text-gray-700/60"
        />
        {slices.map((slice) => (
          <path
            key={slice.bucket}
            d={slice.d}
            fill={slice.color}
            fillRule="evenodd"
          >
            <title>{`${BUCKET_LABEL[slice.bucket]}: ${slice.count}`}</title>
          </path>
        ))}
        {total > 0 ? (
          <text
            x={CENTER}
            y={CENTER}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-gray-700 dark:fill-gray-200"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            {total}
          </text>
        ) : null}
      </svg>

      <div className="flex flex-col gap-1.5 text-sm">
        {BUCKET_ORDER.map((bucket) => {
          const count = data.find((d) => d.signal_type === bucket)?.count ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div
              key={bucket}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-300"
            >
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: BUCKET_COLOR[bucket] }}
                aria-hidden="true"
              />
              <span className="font-medium">{BUCKET_LABEL[bucket]}</span>
              <span className="tabular-nums text-gray-500 dark:text-gray-400">
                {count}
                {total > 0 ? ` · ${pct}%` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SignalTypeDonut;
