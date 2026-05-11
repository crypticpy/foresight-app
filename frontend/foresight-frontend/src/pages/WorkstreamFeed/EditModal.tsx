/**
 * Modal wrapper around `WorkstreamForm` for editing a workstream's filters.
 *
 * @module pages/WorkstreamFeed/EditModal
 */

import { WorkstreamForm } from "../../components/WorkstreamForm";
import type { Workstream } from "./types";

interface EditModalProps {
  workstream: Workstream;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EditModal({ workstream, onSuccess, onCancel }: EditModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-gray-700 px-6 py-4 rounded-t-lg">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Edit Workstream Filters
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Adjust the filters to change which signals match this workstream.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
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
