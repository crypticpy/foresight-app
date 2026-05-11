/**
 * Modal wrapper around `WorkstreamWizard` (create mode) or `WorkstreamForm`
 * (edit mode). The wizard manages its own internal layout; the edit form
 * uses a flat sticky-header shell.
 *
 * @module pages/Workstreams/FormModal
 */

import {
  WorkstreamForm,
  type Workstream,
} from "../../components/WorkstreamForm";
import { WorkstreamWizard } from "../../components/workstream/WorkstreamWizard";
import { cn } from "../../lib/utils";

interface FormModalProps {
  workstream?: Workstream;
  onSuccess: (createdId?: string, scanTriggered?: boolean) => void;
  onCancel: () => void;
}

export function FormModal({ workstream, onSuccess, onCancel }: FormModalProps) {
  const isCreateMode = !workstream;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div
        className={cn(
          "bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full my-8",
          isCreateMode
            ? "max-w-3xl max-h-[90vh] flex flex-col"
            : "max-w-2xl max-h-[90vh] overflow-y-auto",
        )}
      >
        {isCreateMode ? (
          <WorkstreamWizard onSuccess={onSuccess} onCancel={onCancel} />
        ) : (
          <>
            <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-gray-700 px-6 py-4 rounded-t-lg">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Edit Workstream
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Update the filters and settings for this workstream.
              </p>
            </div>
            <div className="px-6 py-4">
              <WorkstreamForm
                workstream={workstream}
                onSuccess={onSuccess}
                onCancel={onCancel}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
