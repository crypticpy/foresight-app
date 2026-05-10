/**
 * Shared types for the GuideWorkstreams page split. Lives in a `.ts` file
 * so the react-refresh rule does not flag mixed component/non-component
 * exports in any sibling `.tsx` files.
 *
 * @module pages/GuideWorkstreams/types
 */

import type { ReactNode } from "react";

export interface QuickStartStep {
  step: number;
  title: string;
  icon: ReactNode;
  description: string;
  details: string;
}
