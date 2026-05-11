/**
 * Loading / empty / error placeholders for the ConceptNetworkDiagram.
 * Pure presentational components rendered inside the diagram container.
 *
 * @module components/visualizations/ConceptNetworkDiagram/States
 */

import { AlertCircle, GitBranch } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center px-4">
      <GitBranch className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
      <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
        No related trends found
      </p>
      <p className="text-gray-400 dark:text-gray-500 text-xs mt-1 max-w-[250px]">
        Related cards will appear here once relationships are established
      </p>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue mb-3" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        Loading network...
      </p>
    </div>
  );
}

export interface NetworkErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function NetworkErrorState({
  message,
  onRetry,
}: NetworkErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center px-4">
      <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
      <p className="text-red-600 dark:text-red-400 text-sm font-medium mb-2">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-brand-blue hover:text-brand-dark-blue text-sm underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
