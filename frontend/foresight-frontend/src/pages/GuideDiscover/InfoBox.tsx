/**
 * Inline info callout used inside accordion sections — non-collapsible,
 * brand-blue tinted background.
 *
 * @module pages/GuideDiscover/InfoBox
 */

import type { ReactNode } from "react";

export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-lg border border-brand-blue/20 bg-brand-light-blue/30 dark:bg-brand-blue/10 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      {children}
    </div>
  );
}
