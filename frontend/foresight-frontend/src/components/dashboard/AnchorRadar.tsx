/**
 * AnchorRadar — hexagonal radar chart for the six Strategic Anchors.
 *
 * Hand-rolled SVG. Each axis is one anchor; the polygon shows the mean
 * 0-100 score across the active card corpus. Background grid rings sit at
 * 25/50/75/100 so the eye can read coverage without axis labels.
 *
 * Renders an empty/explanatory state when no card has anchor scores set
 * (i.e. all `scored_card_count` are zero) instead of drawing a degenerate
 * point at the center.
 */

import { useMemo } from "react";
import { cn } from "../../lib/utils";
import type { AnchorOverview } from "../../types/dashboard";

export interface AnchorRadarProps {
  data: AnchorOverview[];
  className?: string;
  /** Pixel size; the SVG renders square. Default 240. */
  size?: number;
  /** Polygon stroke (default brand-blue). */
  stroke?: string;
  /** Polygon fill (default brand-blue at 20%). */
  fill?: string;
  /** Optional aria-label override. */
  ariaLabel?: string;
}

const RING_PCTS = [0.25, 0.5, 0.75, 1];
// Viewbox is wider than tall so the side labels (longest is
// "Sustainability" at 14 chars) have horizontal breathing room without
// shrinking the chart itself. Width budget: chart radius 86 + label
// offset 16 + ~80 viewbox-units of label glyph = ~182 from center;
// 360-wide viewbox (180 each side) gives ~2 units of margin.
const VIEWBOX_W = 360;
const VIEWBOX_H = 220;
const CENTER_X = VIEWBOX_W / 2;
const CENTER_Y = VIEWBOX_H / 2;
const CHART_RADIUS = 86;
const LABEL_RADIUS = 102;

interface AxisGeometry {
  code: string;
  name: string;
  shortName: string;
  meanScore: number;
  scoredCount: number;
  axisX: number;
  axisY: number;
  pointX: number;
  pointY: number;
  labelX: number;
  labelY: number;
  textAnchor: "start" | "middle" | "end";
}

function shortenAnchorName(name: string): string {
  // Aim for a single word so labels fit comfortably even on the side
  // axes where text-anchor=end pushes glyphs toward the viewbox edge.
  // "Sustainability & Resiliency" → "Sustainability"
  // "Community Trust & Relationships" → "Community"
  // "Proactive Prevention" → "Proactive"
  const ampIdx = name.indexOf("&");
  const head = ampIdx > 0 ? name.slice(0, ampIdx).trim() : name;
  return head.split(/\s+/)[0] ?? head;
}

function pickTextAnchor(angleRad: number): "start" | "middle" | "end" {
  // Top/bottom → middle; right half → start; left half → end.
  const cos = Math.cos(angleRad);
  if (Math.abs(cos) < 0.2) return "middle";
  return cos > 0 ? "start" : "end";
}

function buildAxes(data: AnchorOverview[]): AxisGeometry[] {
  const n = data.length;
  if (n === 0) return [];
  return data.map((anchor, i) => {
    // Start at -PI/2 so the first axis points up.
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const ratio = Math.max(0, Math.min(100, anchor.mean_score)) / 100;

    return {
      code: anchor.code,
      name: anchor.name,
      shortName: shortenAnchorName(anchor.name),
      meanScore: anchor.mean_score,
      scoredCount: anchor.scored_card_count,
      axisX: CENTER_X + cos * CHART_RADIUS,
      axisY: CENTER_Y + sin * CHART_RADIUS,
      pointX: CENTER_X + cos * CHART_RADIUS * ratio,
      pointY: CENTER_Y + sin * CHART_RADIUS * ratio,
      labelX: CENTER_X + cos * LABEL_RADIUS,
      labelY: CENTER_Y + sin * LABEL_RADIUS,
      textAnchor: pickTextAnchor(angle),
    };
  });
}

function buildHexPath(radiusFactor: number, n: number): string {
  if (n === 0) return "";
  let d = "";
  for (let i = 0; i < n; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = CENTER_X + Math.cos(angle) * CHART_RADIUS * radiusFactor;
    const y = CENTER_Y + Math.sin(angle) * CHART_RADIUS * radiusFactor;
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return d + " Z";
}

export function AnchorRadar({
  data,
  className,
  size = 240,
  stroke = "#44499C",
  fill = "rgba(68, 73, 156, 0.2)",
  ariaLabel,
}: AnchorRadarProps) {
  const axes = useMemo(() => buildAxes(data), [data]);

  const hasAnyScores = data.some((d) => d.scored_card_count > 0);

  const polygonPath = useMemo(() => {
    if (axes.length === 0) return "";
    let d = "";
    for (let i = 0; i < axes.length; i += 1) {
      const ax = axes[i]!;
      d +=
        i === 0
          ? `M ${ax.pointX} ${ax.pointY}`
          : ` L ${ax.pointX} ${ax.pointY}`;
    }
    return d + " Z";
  }, [axes]);

  const ringPaths = useMemo(
    () => RING_PCTS.map((p) => buildHexPath(p, axes.length)),
    [axes.length],
  );

  const label =
    ariaLabel ??
    (hasAnyScores
      ? `Strategic anchor radar: ${axes.map((a) => `${a.name} ${a.meanScore.toFixed(0)}`).join(", ")}.`
      : "Strategic anchor radar: no cards scored yet.");

  // The chart's intrinsic aspect ratio is set by the wider viewbox so labels
  // get horizontal breathing room. We size the rendered SVG by `size`
  // (vertical axis) and let the width scale to match the viewbox ratio.
  const renderedWidth = (size * VIEWBOX_W) / VIEWBOX_H;

  return (
    <div
      className={cn("relative inline-block", className)}
      style={{ width: renderedWidth, height: size }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        width={renderedWidth}
        height={size}
        role="img"
        aria-label={label}
      >
        {/* Grid rings */}
        {ringPaths.map((d, i) => (
          <path
            key={`ring-${i}`}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
            className="text-gray-500 dark:text-gray-400"
          />
        ))}

        {/* Axes */}
        {axes.map((ax) => (
          <line
            key={`axis-${ax.code}`}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={ax.axisX}
            y2={ax.axisY}
            stroke="currentColor"
            strokeOpacity={0.1}
            className="text-gray-500 dark:text-gray-400"
          />
        ))}

        {/* Filled polygon */}
        {hasAnyScores && polygonPath ? (
          <>
            <path
              d={polygonPath}
              fill={fill}
              stroke={stroke}
              strokeWidth={1.5}
            />
            {axes.map((ax) => (
              <circle
                key={`pt-${ax.code}`}
                cx={ax.pointX}
                cy={ax.pointY}
                r={2.5}
                fill={stroke}
              />
            ))}
          </>
        ) : null}

        {/* Axis labels */}
        {axes.map((ax) => (
          <text
            key={`lbl-${ax.code}`}
            x={ax.labelX}
            y={ax.labelY}
            textAnchor={ax.textAnchor}
            dominantBaseline="middle"
            className="fill-gray-600 dark:fill-gray-300"
            style={{ fontSize: 10, fontWeight: 500 }}
          >
            {ax.shortName}
          </text>
        ))}
      </svg>

      {!hasAnyScores ? (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center text-center",
            "pointer-events-none",
          )}
        >
          <span className="text-[11px] text-gray-500 dark:text-gray-400 px-4">
            No anchor scores yet
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default AnchorRadar;
