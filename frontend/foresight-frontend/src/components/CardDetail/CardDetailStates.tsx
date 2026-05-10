/**
 * Top-level loading + not-found chrome for the CardDetail route. Split out
 * so `CardDetail.tsx` only owns the happy-path render and tab dispatch.
 *
 * @module components/CardDetail/CardDetailStates
 */

import { Link } from "react-router-dom";
import { ArrowLeft, Compass, FileQuestion } from "lucide-react";

import { cn } from "../../lib/utils";

export interface CardDetailLoadingProps {
  embedded?: boolean;
}

export function CardDetailLoading({
  embedded = false,
}: CardDetailLoadingProps) {
  return (
    <div
      className={cn(
        "min-h-screen flex items-center justify-center",
        embedded && "min-h-[24rem]",
      )}
    >
      <div className="animate-spin rounded-full h-16 w-16 sm:h-24 sm:w-24 border-b-2 border-brand-blue" />
    </div>
  );
}

export interface CardDetailNotFoundProps {
  backLink: string;
  backLinkText: string;
  embedded?: boolean;
}

export function CardDetailNotFound({
  backLink,
  backLinkText,
  embedded = false,
}: CardDetailNotFoundProps) {
  return (
    <div
      className={cn(
        "max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16",
        embedded && "px-0 sm:px-0 lg:px-0 py-10",
      )}
    >
      <div className="text-center bg-white dark:bg-dark-surface rounded-2xl shadow border border-gray-200 dark:border-gray-700 p-10">
        <div className="mx-auto h-14 w-14 rounded-full bg-brand-blue/10 dark:bg-brand-blue/20 flex items-center justify-center mb-5">
          <FileQuestion className="h-7 w-7 text-brand-blue" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Signal not found
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          This signal may have been removed, renamed, or the link is incorrect.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={backLink}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-blue hover:bg-brand-dark-blue text-white text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLinkText}
          </Link>
          <Link
            to="/discover"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-surface-hover text-sm font-medium transition-colors"
          >
            <Compass className="h-4 w-4" />
            Browse all signals
          </Link>
        </div>
      </div>
    </div>
  );
}
