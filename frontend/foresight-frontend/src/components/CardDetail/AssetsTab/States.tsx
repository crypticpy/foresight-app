/**
 * Loading / Error / Empty placeholder views for the AssetsTab.
 *
 * @module components/CardDetail/AssetsTab/States
 */

import { FileText, History, Loader2 } from "lucide-react";

import { COA_COLORS } from "./constants";

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
      <p className="text-gray-500 dark:text-gray-400">Loading assets...</p>
    </div>
  );
}

export interface ErrorStateProps {
  error: string;
  onRefresh?: () => void;
}

export function ErrorState({ error, onRefresh }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="text-red-500 mb-4">
        <FileText className="h-12 w-12" />
      </div>
      <p className="text-gray-900 dark:text-white font-medium mb-2">
        Failed to load assets
      </p>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{error}</p>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div
        className="p-4 rounded-full mb-4"
        style={{ backgroundColor: COA_COLORS.lightBlue }}
      >
        <History className="h-8 w-8" style={{ color: COA_COLORS.logoBlue }} />
      </div>
      <p className="text-gray-900 dark:text-white font-medium mb-2">
        No assets yet
      </p>
      <p className="text-gray-500 dark:text-gray-400 text-sm text-center max-w-sm">
        Generated content like executive briefs, research reports, and exports
        will appear here.
      </p>
    </div>
  );
}
