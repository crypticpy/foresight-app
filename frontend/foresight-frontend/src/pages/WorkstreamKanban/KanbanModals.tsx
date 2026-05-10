/**
 * Modal/drawer stack rendered below the kanban board. Keeping the modals in
 * one component lets the page composer stay focused on data wiring while
 * still threading the per-modal callbacks through a single prop bag.
 *
 * @module pages/WorkstreamKanban/KanbanModals
 */

import type { Workstream } from "../../components/WorkstreamForm";
import { BriefPreviewModal } from "../../components/kanban/BriefPreviewModal";
import { BulkExportModal } from "../../components/BulkExportModal";
import { ExportProgressModal } from "../../components/ExportProgressModal";
import { ActivityRail } from "../../components/activity/ActivityRail";
import { MembersDrawer } from "../../components/collaboration/MembersDrawer";
import { ShareWorkstreamModal } from "../../components/collaboration/ShareWorkstreamModal";
import { WorkstreamChatPanel } from "../../components/WorkstreamChatPanel";

import { FormModal } from "./FormModal";
import { SignalDetailModal } from "./SignalDetailModal";
import type { useBriefFlow } from "./useBriefFlow";
import type { useBulkExport } from "./useBulkExport";

type BriefFlow = ReturnType<typeof useBriefFlow>;
type BulkExport = ReturnType<typeof useBulkExport>;

export interface KanbanModalsProps {
  workstream: Workstream;
  workstreamId: string;
  canManage: boolean;
  showEditModal: boolean;
  onEditClose: () => void;
  onEditSuccess: () => void;
  chatOpen: boolean;
  onChatClose: () => void;
  shareOpen: boolean;
  onShareClose: () => void;
  membersOpen: boolean;
  onMembersClose: () => void;
  activityOpen: boolean;
  onActivityClose: () => void;
  selectedSignalSlug: string | null;
  onSignalClose: () => void;
  onSignalSlugChange: (slug: string | null) => void;
  briefFlow: BriefFlow;
  bulkExport: BulkExport;
}

export function KanbanModals({
  workstream,
  workstreamId,
  canManage,
  showEditModal,
  onEditClose,
  onEditSuccess,
  chatOpen,
  onChatClose,
  shareOpen,
  onShareClose,
  membersOpen,
  onMembersClose,
  activityOpen,
  onActivityClose,
  selectedSignalSlug,
  onSignalClose,
  onSignalSlugChange,
  briefFlow,
  bulkExport,
}: KanbanModalsProps) {
  const briefForModal = briefFlow.briefModalCard
    ? (() => {
        const brief = briefFlow.getCardBrief(briefFlow.briefModalCard.card.id);
        if (!brief) return null;
        return {
          id: brief.id,
          card_id: brief.card_id,
          title: briefFlow.briefModalCard.card.name,
          executive_summary: brief.summary || "",
          content_markdown: brief.content_markdown || "",
          created_at: brief.created_at,
        };
      })()
    : null;

  const exportState = briefFlow.exportProgress.state;

  return (
    <>
      {showEditModal && (
        <FormModal
          workstream={workstream}
          onSuccess={onEditSuccess}
          onCancel={onEditClose}
        />
      )}

      <BriefPreviewModal
        isOpen={briefFlow.showBriefModal}
        onClose={briefFlow.handleBriefModalClose}
        brief={briefForModal}
        isGenerating={
          briefFlow.briefModalCard
            ? briefFlow.isCardGenerating(briefFlow.briefModalCard.card.id)
            : false
        }
        error={
          briefFlow.briefModalCard
            ? briefFlow.getCardError(briefFlow.briefModalCard.card.id)
                ?.message || null
            : null
        }
        onExportPdf={() => briefFlow.handleBriefExport("pdf")}
        onExportPptx={() => briefFlow.handleBriefExport("pptx")}
        cardName={briefFlow.briefModalCard?.card.name || ""}
        onRetry={
          briefFlow.briefModalCard
            ? () =>
                briefFlow.triggerBriefGeneration(
                  briefFlow.briefModalCard!.card.id,
                )
            : undefined
        }
      />

      <ExportProgressModal
        isOpen={exportState.showModal}
        onClose={briefFlow.exportProgress.closeModal}
        status={exportState.status}
        format={exportState.format || "pptx"}
        progress={exportState.progress}
        statusMessage={exportState.statusMessage}
        errorMessage={exportState.errorMessage || undefined}
        downloadUrl={exportState.downloadUrl || undefined}
        filename={exportState.filename || undefined}
        onDownload={briefFlow.exportProgress.downloadExport}
        onRetry={briefFlow.exportProgress.retryExport}
        itemName={exportState.itemName || undefined}
        isGammaPowered={exportState.isGammaPowered}
        estimatedTimeSeconds={exportState.estimatedTimeSeconds}
      />

      <BulkExportModal
        isOpen={bulkExport.showBulkExportModal}
        onClose={bulkExport.handleCloseBulkExport}
        workstreamName={workstream.name}
        statusData={bulkExport.bulkExportStatus}
        isLoading={bulkExport.bulkExportLoading}
        error={bulkExport.bulkExportError}
        onExport={bulkExport.handleExecuteBulkExport}
        isExporting={bulkExport.isBulkExporting}
      />

      <SignalDetailModal
        slug={selectedSignalSlug}
        onClose={onSignalClose}
        onSlugChange={onSignalSlugChange}
      />

      <WorkstreamChatPanel
        workstreamId={workstreamId}
        workstreamName={workstream.name}
        isOpen={chatOpen}
        onClose={onChatClose}
      />

      <ShareWorkstreamModal
        workstreamId={workstream.id}
        open={shareOpen}
        onClose={onShareClose}
      />
      <MembersDrawer
        workstreamId={workstream.id}
        open={membersOpen}
        canManage={canManage}
        onClose={onMembersClose}
      />
      <ActivityRail
        workstreamId={workstream.id}
        open={activityOpen}
        onClose={onActivityClose}
      />
    </>
  );
}
