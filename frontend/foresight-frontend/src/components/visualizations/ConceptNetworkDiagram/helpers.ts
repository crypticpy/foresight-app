/**
 * Pure helpers for the ConceptNetworkDiagram: horizon → Tailwind colour
 * lookup, relationship-type formatting, edge stroke-width mapping, and
 * the minimap colour function. No React, no React Flow imports.
 *
 * @module components/visualizations/ConceptNetworkDiagram/helpers
 */

import type { Node } from "@xyflow/react";

import type { CardNodeData, Horizon, HorizonColors } from "./types";

const HORIZON_COLOR_MAP: Record<Horizon, HorizonColors> = {
  H1: {
    bg: "bg-green-50 dark:bg-green-900/30",
    border: "border-green-400 dark:border-green-500",
    text: "text-green-800 dark:text-green-200",
    fill: "#22c55e",
  },
  H2: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-400 dark:border-amber-500",
    text: "text-amber-800 dark:text-amber-200",
    fill: "#f59e0b",
  },
  H3: {
    bg: "bg-purple-50 dark:bg-purple-900/30",
    border: "border-purple-400 dark:border-purple-500",
    text: "text-purple-800 dark:text-purple-200",
    fill: "#a855f7",
  },
};

const FALLBACK_COLORS: HorizonColors = {
  bg: "bg-gray-50 dark:bg-dark-surface",
  border: "border-gray-300 dark:border-gray-600",
  text: "text-gray-800 dark:text-gray-200",
  fill: "#6b7280",
};

export function getHorizonColors(horizon?: Horizon | null): HorizonColors {
  if (!horizon) return FALLBACK_COLORS;
  return HORIZON_COLOR_MAP[horizon] ?? FALLBACK_COLORS;
}

export function formatRelationshipType(type?: string | null): string {
  if (!type) return "";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getEdgeStrokeWidth(strength?: number | null): number {
  if (strength === null || strength === undefined) return 2;
  // Map strength (0-1) to stroke width (1-4)
  return 1 + strength * 3;
}

export function minimapNodeColor(node: Node<CardNodeData>): string {
  if (node.data?.isSource) return "#3b82f6";
  const horizon = node.data?.horizon;
  if (horizon === "H1") return "#22c55e";
  if (horizon === "H2") return "#f59e0b";
  if (horizon === "H3") return "#a855f7";
  return "#6b7280";
}
