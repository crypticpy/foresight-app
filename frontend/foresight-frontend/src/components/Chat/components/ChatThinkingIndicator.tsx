/**
 * Small "Foresight is thinking..." row shown while the server is
 * streaming but has not yet produced any visible content. When a
 * `progressStep` is supplied (e.g. "Searching cards", "Reranking..."),
 * its detail message replaces the generic label.
 *
 * @module components/Chat/components/ChatThinkingIndicator
 */

import { Loader2, Sparkles } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface ProgressStep {
  step: string;
  detail: string;
}

export interface ChatThinkingIndicatorProps {
  progressStep: ProgressStep | null | undefined;
}

export function ChatThinkingIndicator({
  progressStep,
}: ChatThinkingIndicatorProps) {
  return (
    <div className="mt-4 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
      <div
        className={cn(
          "flex items-center justify-center w-6 h-6 rounded-full shrink-0",
          "bg-brand-blue/10 dark:bg-brand-blue/20",
        )}
      >
        <Sparkles className="h-3.5 w-3.5 text-brand-blue" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-brand-blue"
            aria-hidden="true"
          />
          <span className={progressStep ? "text-sm" : undefined}>
            {progressStep ? progressStep.detail : "Foresight is thinking..."}
          </span>
        </div>
      </div>
    </div>
  );
}
