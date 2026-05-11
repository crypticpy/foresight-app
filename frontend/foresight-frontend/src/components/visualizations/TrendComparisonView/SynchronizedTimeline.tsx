/**
 * Dual-line Recharts plot showing the same score over time for both
 * cards on a shared X-axis. Includes a score-type dropdown so the
 * caller can change which metric is on display, and renders an empty
 * state when fewer than two data points are available.
 *
 * @module components/visualizations/TrendComparisonView/SynchronizedTimeline
 */

import { format, parseISO } from "date-fns";
import { TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SCORE_CONFIGS, type ScoreType } from "../ScoreTimelineChart";
import type { MergedDataPoint } from "./types";

export interface SynchronizedTimelineProps {
  data: MergedDataPoint[];
  card1Name: string;
  card2Name: string;
  selectedScore: ScoreType;
  onScoreChange: (score: ScoreType) => void;
  height?: number;
}

// Map each score key to the two data-keys that hold it on the merged
// timeline (one for each card). Lives at module scope so it isn't
// rebuilt on every render.
const SCORE_KEY_MAP: Record<ScoreType, { card1: string; card2: string }> = {
  maturity_score: { card1: "card1_maturity", card2: "card2_maturity" },
  velocity_score: { card1: "card1_velocity", card2: "card2_velocity" },
  novelty_score: { card1: "card1_novelty", card2: "card2_novelty" },
  impact_score: { card1: "card1_impact", card2: "card2_impact" },
  relevance_score: { card1: "card1_relevance", card2: "card2_relevance" },
  risk_score: { card1: "card1_risk", card2: "card2_risk" },
  opportunity_score: {
    card1: "card1_opportunity",
    card2: "card2_opportunity",
  },
};

export function SynchronizedTimeline({
  data,
  card1Name,
  card2Name,
  selectedScore,
  onScoreChange,
  height = 350,
}: SynchronizedTimelineProps) {
  const scoreConfig = SCORE_CONFIGS.find((c) => c.key === selectedScore);
  const keys = SCORE_KEY_MAP[selectedScore];

  const formatXAxisTick = (value: string) => {
    try {
      const date = parseISO(value);
      if (data.length > 90) {
        return format(date, "MMM yyyy");
      }
      return format(date, "MMM d");
    } catch {
      return value;
    }
  };

  if (data.length < 2) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <TrendingUp className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            Not enough historical data for timeline comparison
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-brand-blue" />
          Timeline Comparison
        </h3>

        <select
          value={selectedScore}
          onChange={(e) => onScoreChange(e.target.value as ScoreType)}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-blue focus:border-transparent"
        >
          {SCORE_CONFIGS.map((config) => (
            <option key={config.key} value={config.key}>
              {config.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              opacity={0.5}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxisTick}
              tick={{ fontSize: 11 }}
              tickLine={{ stroke: "currentColor" }}
              axisLine={{ stroke: "currentColor" }}
              className="text-gray-500 dark:text-gray-400"
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              tickLine={{ stroke: "currentColor" }}
              axisLine={{ stroke: "currentColor" }}
              className="text-gray-500 dark:text-gray-400"
              tickCount={6}
              width={40}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload) return null;
                return (
                  <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                      {format(parseISO(label), "MMM d, yyyy")}
                    </div>
                    <div className="space-y-1.5">
                      {payload.map((item) => (
                        <div
                          key={item.dataKey}
                          className="flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-gray-600 dark:text-gray-300">
                              {item.name}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {item.value !== null
                              ? Math.round(item.value as number)
                              : "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ paddingTop: "20px" }} />
            <Line
              type="monotone"
              dataKey={keys.card1}
              name={card1Name}
              stroke={scoreConfig?.color || "#8884d8"}
              strokeWidth={2}
              dot={data.length <= 30}
              connectNulls
              isAnimationActive={data.length <= 365}
            />
            <Line
              type="monotone"
              dataKey={keys.card2}
              name={card2Name}
              stroke={
                scoreConfig?.color ? `${scoreConfig.color}80` : "#8884d880"
              }
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={data.length <= 30}
              connectNulls
              isAnimationActive={data.length <= 365}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-0.5"
            style={{ backgroundColor: scoreConfig?.color || "#8884d8" }}
          />
          <span>Solid line: {card1Name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-0.5"
            style={{
              backgroundColor: scoreConfig?.color || "#8884d8",
              opacity: 0.5,
              backgroundImage:
                "repeating-linear-gradient(90deg, transparent, transparent 3px, currentColor 3px, currentColor 6px)",
            }}
          />
          <span>Dashed line: {card2Name}</span>
        </div>
      </div>
    </div>
  );
}
