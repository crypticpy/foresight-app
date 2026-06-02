/**
 * Shared types for the GuideChat page split. Lives in a `.ts` file so the
 * react-refresh rule does not flag mixed component/non-component exports in
 * any sibling `.tsx` files.
 *
 * @module pages/GuideChat/types
 */

import type { ReactNode } from "react";

export interface QuickStartStep {
  step: number;
  title: string;
  icon: ReactNode;
  description: string;
  details: string;
}
