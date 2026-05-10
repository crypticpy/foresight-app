/**
 * CardDetail Utility Functions and Constants
 *
 * This module contains shared utility functions and constants used across
 * the CardDetail component and its sub-components.
 */

import type { ScoreColorClasses, MetricDefinition } from "./types";

export { API_BASE_URL } from "../../lib/config";

/**
 * Metric definitions with descriptions for tooltips
 * Used in the Impact Metrics panel to provide context for each score
 */
export const metricDefinitions: Record<string, MetricDefinition> = {
  impact: {
    label: "Impact",
    description:
      "Potential magnitude of effect on City operations, services, or residents",
  },
  relevance: {
    label: "Relevance",
    description:
      "How closely this aligns with current City priorities and strategic goals",
  },
  velocity: {
    label: "Velocity",
    description: "Speed of development and adoption in the broader ecosystem",
  },
  novelty: {
    label: "Novelty",
    description:
      "How new or unprecedented this signal is compared to existing knowledge",
  },
  opportunity: {
    label: "Opportunity",
    description:
      "Potential benefits and positive outcomes if adopted or leveraged",
  },
  risk: {
    label: "Risk",
    description: "Potential negative consequences or challenges to consider",
  },
};

/**
 * Parse stage number from stage_id string
 *
 * Handles formats like "1_concept", "3_prototype", etc.
 * Extracts the leading numeric portion of the stage identifier.
 *
 * @param stageId - The stage identifier string (e.g., "1_concept", "3_prototype")
 * @returns The parsed stage number (1-6) or null if parsing fails
 *
 * @example
 * parseStageNumber("1_concept") // returns 1
 * parseStageNumber("3_prototype") // returns 3
 * parseStageNumber("invalid") // returns null
 * parseStageNumber("") // returns null
 */
export const parseStageNumber = (stageId: string): number | null => {
  if (!stageId) return null;
  const match = stageId.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Get score color classes based on score value
 *
 * Returns Tailwind CSS classes for background, text, and border colors
 * based on the score value. Colors follow a traffic light pattern:
 * - Green (80-100): High/Good scores
 * - Amber (60-79): Medium-high scores
 * - Orange (40-59): Medium-low scores
 * - Red (0-39): Low scores
 *
 * All colors are WCAG 2.1 AA compliant with minimum 4.5:1 contrast ratio.
 *
 * @param score - The score value (0-100)
 * @returns Object containing bg, text, and border Tailwind CSS classes
 *
 * @example
 * getScoreColorClasses(85) // returns green classes
 * getScoreColorClasses(65) // returns amber classes
 * getScoreColorClasses(45) // returns orange classes
 * getScoreColorClasses(25) // returns red classes
 */
export const getScoreColorClasses = (score: number): ScoreColorClasses => {
  if (score >= 80) {
    return {
      bg: "bg-green-100 dark:bg-green-900/40",
      text: "text-green-800 dark:text-green-200",
      border: "border-green-400 dark:border-green-600",
    };
  }
  if (score >= 60) {
    return {
      bg: "bg-amber-100 dark:bg-amber-900/40",
      text: "text-amber-800 dark:text-amber-200",
      border: "border-amber-400 dark:border-amber-600",
    };
  }
  if (score >= 40) {
    return {
      bg: "bg-orange-100 dark:bg-orange-900/40",
      text: "text-orange-800 dark:text-orange-200",
      border: "border-orange-400 dark:border-orange-600",
    };
  }
  return {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-800 dark:text-red-200",
    border: "border-red-400 dark:border-red-600",
  };
};

export { formatRelativeTime } from "@/lib/utils";
