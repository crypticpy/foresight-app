/**
 * Modal chrome that wraps `WorkstreamForm` for editing the active
 * workstream's filters in place. The composer renders this conditionally
 * on `showEditModal`.
 *
 * @module pages/WorkstreamKanban/FormModal
 */

import {
  WorkstreamForm,
  type Workstream,
} from "../../components/WorkstreamForm";

interface FormModalProps {
  workstream: Workstream;
  onSuccess: () => void;
  onCancel: () => void;
}

export function FormModal({ workstream, onSuccess, onCancel }: FormModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto my-8">
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-gray-700 px-6 py-4 rounded-t-lg">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Edit Workstream Filters
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
      </div>
    </div>
  );
}
