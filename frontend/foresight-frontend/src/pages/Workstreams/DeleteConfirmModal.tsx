/**
 * Confirmation modal shown before deleting a workstream.
 *
 * @module pages/Workstreams/DeleteConfirmModal
 */

import { AlertTriangle } from "lucide-react";
import type { Workstream } from "../../components/WorkstreamForm";

interface DeleteConfirmModalProps {
  workstream: Workstream;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function DeleteConfirmModal({
  workstream,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Delete Workstream
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete{" "}
              <span className="font-semibold">
                &quot;{workstream.name}&quot;
              </span>
              ? This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-surface-elevated border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
