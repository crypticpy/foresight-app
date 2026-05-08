/**
 * Sparkline — hand-rolled SVG line chart for KPI tiles.
 *
 * No chart library: axis-less, fixed viewBox, scales linearly to its
 * container via `preserveAspectRatio="none"` so the parent owns sizing.
 *
 * Design choices:
 *   - Renders a degenerate flat line at mid-height when all values are 0,
 *     so the tile never looks broken on cold-start corpora.
 *   - Single-point series renders as a centered dot.
 *   - Final-point dot is always drawn (sparklines are read right-to-left;
 *     the eye lands on "now").
 */

import { useMemo } from "react";
import { cn } from "../../lib/utils";

export interface SparklinePoint {
  date: string;
  value: number;
}

export interface SparklineProps {
  data: SparklinePoint[];
  className?: string;
  /** Stroke color (default: brand-blue). Pass a hex/HSL string. */
  stroke?: string;
  /** Fill underneath the line (default: same as stroke at 12% alpha). */
  fill?: string;
  /** Stroke width in viewBox units (default: 2). */
  strokeWidth?: number;
  /** Optional aria-label override; default summarizes value range. */
  ariaLabel?: string;
}

const VIEW_W = 100;
const VIEW_H = 32;
const PAD_Y = 3;

interface ChartGeometry {
  linePath: string;
  areaPath: string;
  lastX: number;
  lastY: number;
  lastValue: number;
  hasData: boolean;
}

function computeGeometry(data: SparklinePoint[]): ChartGeometry {
  if (data.length === 0) {
    return {
      linePath: "",
      areaPath: "",
      lastX: VIEW_W,
      lastY: VIEW_H / 2,
      lastValue: 0,
      hasData: false,
    };
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const usableH = VIEW_H - PAD_Y * 2;

  const yFor = (v: number): number => {
    if (span === 0) return VIEW_H / 2;
    return PAD_Y + (1 - (v - min) / span) * usableH;
  };

  const first = data[0]!;
  const last = data[data.length - 1]!;

  if (data.length === 1) {
    const x = VIEW_W / 2;
    const y = yFor(first.value);
    return {
      linePath: `M ${x} ${y}`,
      areaPath: "",
      lastX: x,
      lastY: y,
      lastValue: first.value,
      hasData: true,
    };
  }

  const stepX = VIEW_W / (data.length - 1);
  let linePath = "";
  let lastX = 0;
  let lastY = 0;
  for (let i = 0; i < data.length; i += 1) {
    const point = data[i]!;
    const x = i * stepX;
    const y = yFor(point.value);
    linePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    lastX = x;
    lastY = y;
  }

  const areaPath =
    `M 0 ${VIEW_H} L 0 ${yFor(first.value)}` +
    linePath.slice(1) +
    ` L ${VIEW_W} ${VIEW_H} Z`;

  return {
    linePath,
    areaPath,
    lastX,
    lastY,
    lastValue: last.value,
    hasData: true,
  };
}

export function Sparkline({
  data,
  className,
  stroke = "#44499C",
  fill,
  strokeWidth = 2,
  ariaLabel,
}: SparklineProps) {
  const geometry = useMemo(() => computeGeometry(data), [data]);

  const resolvedFill = fill ?? `${stroke}1f`; // ~12% alpha (#1f hex)
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const label =
    ariaLabel ??
    (geometry.hasData
      ? `Sparkline showing ${total} events over ${data.length} days, ending at ${geometry.lastValue}.`
      : "Sparkline with no data.");

  return (
    <svg
      className={cn("block w-full h-full", className)}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {geometry.areaPath ? (
        <path d={geometry.areaPath} fill={resolvedFill} stroke="none" />
      ) : null}
      {geometry.linePath ? (
        <path
          d={geometry.linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {geometry.hasData ? (
        <circle
          cx={geometry.lastX}
          cy={geometry.lastY}
          r={2.25}
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

export default Sparkline;
