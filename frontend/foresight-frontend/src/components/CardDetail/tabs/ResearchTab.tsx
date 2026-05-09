/**
 * ResearchTab — dedicated surface for Strategic Intelligence Reports
 * (deep-research output) and the per-card Update History timeline.
 *
 * Previously these two panels lived inline on the Overview tab, where
 * they competed for space with description, classification, and score
 * history. Lifting them onto their own tab makes it easier to track
 * and revisit insights without scrolling past everything else.
 */

import React from "react";

import { DeepResearchPanel } from "./OverviewTab/DeepResearchPanel";
import { ResearchHistoryPanel } from "./OverviewTab/ResearchHistoryPanel";
import type { ResearchTask } from "../types";

export interface ResearchTabProps {
  researchHistory: ResearchTask[];
  onRequestDeepResearch?: () => void;
  canRequestDeepResearch?: boolean;
}

export const ResearchTab: React.FC<ResearchTabProps> = ({
  researchHistory,
  onRequestDeepResearch,
  canRequestDeepResearch,
}) => {
  const updateHistory = researchHistory.filter(
    (task) => task.task_type !== "deep_research",
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <DeepResearchPanel
        researchTasks={researchHistory}
        onRequestResearch={onRequestDeepResearch}
        canRequestResearch={canRequestDeepResearch}
      />
      {updateHistory.length > 0 && (
        <ResearchHistoryPanel
          researchHistory={updateHistory}
          title="Update History"
        />
      )}
    </div>
  );
};

export default ResearchTab;
