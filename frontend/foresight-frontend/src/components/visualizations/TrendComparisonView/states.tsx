/**
 * The three placeholder states for TrendComparisonView: still loading,
 * error (with retry), and "no two card ids supplied" (with a primer
 * pointing the user back to Discover).
 *
 * @module components/visualizations/TrendComparisonView/states
 */

import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeftRight, Loader2, RefreshCw } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="h-12 w-12 text-brand-blue animate-spin mb-4" />
      <p className="text-gray-600 dark:text-gray-300 text-lg">
        Loading comparison data...
      </p>
      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
        This may take a moment
      </p>
    </div>
  );
}

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <AlertCircle className="h-16 w-16 text-red-400 mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Comparison Failed
      </h2>
      <p className="text-gray-600 dark:text-gray-300 max-w-md mb-4">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-dark-blue transition-colors"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </button>
      )}
    </div>
  );
}

export function InvalidParamsState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <ArrowLeftRight className="h-16 w-16 text-gray-400 mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Select Two Signals to Compare
      </h2>
      <p className="text-gray-600 dark:text-gray-300 max-w-md mb-2">
        Compare trends, scores, and timelines side-by-side.
      </p>
      <ol className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-5 text-left list-decimal list-inside space-y-1">
        <li>Open the Discover page</li>
        <li>
          Click <span className="font-semibold">Compare</span> to enter
          selection mode
        </li>
        <li>
          Pick two signals, then choose{" "}
          <span className="font-semibold">Compare selected</span>
        </li>
      </ol>
      <Link
        to="/discover"
        className="inline-flex items-center px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-dark-blue transition-colors"
      >
        Go to Discover
      </Link>
    </div>
  );
}
