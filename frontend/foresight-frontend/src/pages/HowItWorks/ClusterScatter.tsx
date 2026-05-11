/**
 * Static SVG illustration of three clusters in vector space (Mobility,
 * Climate & Energy, Civic AI) with a candidate point that visualises the
 * 0.92-cosine dedup threshold. Coordinates are illustrative, not real.
 *
 * @module pages/HowItWorks/ClusterScatter
 */

import { useMemo } from "react";

export function ClusterScatter() {
  // Three illustrative clusters; not real data. Coords in a 600x400 canvas
  // with 40px padding so labels and glows stay inside the viewBox.
  const clusters = useMemo<
    Array<{
      color: string;
      label: string;
      labelPos: [number, number];
      points: Array<[number, number]>;
    }>
  >(
    () => [
      {
        color: "#44499C",
        label: "Mobility",
        labelPos: [140, 60],
        points: [
          [130, 130],
          [150, 150],
          [115, 155],
          [165, 135],
          [135, 175],
          [160, 115],
        ],
      },
      {
        color: "#009F4D",
        label: "Climate & Energy",
        labelPos: [445, 60],
        points: [
          [430, 105],
          [455, 125],
          [415, 140],
          [475, 115],
          [445, 165],
          [485, 145],
        ],
      },
      {
        color: "#7C4DFF",
        label: "Civic AI",
        labelPos: [285, 360],
        points: [
          [275, 270],
          [300, 290],
          [255, 295],
          [320, 265],
          [285, 320],
          [240, 275],
        ],
      },
    ],
    [],
  );

  // Highlight a single "candidate" point near the Mobility cluster — shows
  // the 0.92 similarity ring so it gets merged in as another source.
  const candidate: [number, number] = [180, 170];
  const dedupTarget: [number, number] = [150, 150];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6">
      <svg
        viewBox="0 0 600 400"
        className="w-full h-auto"
        role="img"
        aria-label="Semantic similarity cluster scatter plot"
      >
        <defs>
          <radialGradient id="clusterGlow">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        {/* Faint grid + axis labels, suggesting "vector space" */}
        <rect
          x="0"
          y="0"
          width="600"
          height="400"
          fill="url(#grid)"
          className="text-gray-400 dark:text-gray-600"
        />
        <text
          x="20"
          y="20"
          fill="currentColor"
          className="text-gray-400 dark:text-gray-500"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          dim_1
        </text>
        <text
          x="580"
          y="390"
          fill="currentColor"
          textAnchor="end"
          className="text-gray-400 dark:text-gray-500"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          dim_2 · 1,536-dim space (projected to 2D)
        </text>

        {/* Clusters */}
        {clusters.map((c) => {
          const cx = c.points.reduce((s, p) => s + p[0], 0) / c.points.length;
          const cy = c.points.reduce((s, p) => s + p[1], 0) / c.points.length;
          return (
            <g key={c.label} style={{ color: c.color }}>
              <circle cx={cx} cy={cy} r={80} fill="url(#clusterGlow)" />
              {c.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={7}
                  fill={c.color}
                  stroke="white"
                  strokeWidth="1.5"
                  className="animate-[fadeIn_600ms_ease-out_both]"
                  style={{ animationDelay: `${i * 70}ms` }}
                />
              ))}
              <text
                x={c.labelPos[0]}
                y={c.labelPos[1]}
                textAnchor="middle"
                fill={c.color}
                fontSize="14"
                fontWeight="700"
              >
                {c.label}
              </text>
            </g>
          );
        })}

        {/* Candidate / dedup demonstration */}
        <g
          className="animate-[fadeIn_600ms_ease-out_both]"
          style={{ animationDelay: "700ms" }}
        >
          <line
            x1={candidate[0]}
            y1={candidate[1]}
            x2={dedupTarget[0]}
            y2={dedupTarget[1]}
            stroke="#44499C"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.6"
          />
          <circle
            cx={candidate[0]}
            cy={candidate[1]}
            r="22"
            fill="none"
            stroke="#44499C"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.55"
          />
          <circle
            cx={candidate[0]}
            cy={candidate[1]}
            r="7"
            fill="white"
            stroke="#44499C"
            strokeWidth="2"
          />
          <text
            x={candidate[0] + 30}
            y={candidate[1] - 4}
            fill="#44499C"
            fontSize="11"
            fontWeight="600"
          >
            new article
          </text>
          <text
            x={candidate[0] + 30}
            y={candidate[1] + 10}
            fill="#44499C"
            fontSize="10"
            opacity="0.75"
          >
            cosine 0.94 → dedup
          </text>
        </g>
      </svg>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface-deep">
          <span className="h-2.5 w-2.5 rounded-full bg-[#44499C]" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Mobility
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-auto">
            ~6 cards
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface-deep">
          <span className="h-2.5 w-2.5 rounded-full bg-[#009F4D]" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Climate &amp; Energy
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-auto">
            ~6 cards
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface-deep">
          <span className="h-2.5 w-2.5 rounded-full bg-[#7C4DFF]" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Civic AI
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-auto">
            ~6 cards
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 leading-relaxed">
        Cards near each other in this 1,536-dimensional space share{" "}
        <em>meaning</em> — not just keywords. The dashed ring shows the dedup
        threshold: when a new article lands within{" "}
        <span className="font-semibold text-brand-blue">cosine 0.92</span> of an
        existing card, it gets merged in as another source instead of creating a
        duplicate.
      </p>
    </div>
  );
}
