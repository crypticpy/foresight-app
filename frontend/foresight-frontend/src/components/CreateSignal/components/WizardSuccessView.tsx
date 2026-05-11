/**
 * Success state shown after a signal has been created. Displays the
 * created card's name, a description of what happened (deep research
 * vs quick scan), and two actions: a link to view the card or a
 * "Create Another" button that resets the wizard.
 *
 * @module CreateSignal/components/WizardSuccessView
 */

import { CheckCircle, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useRef, type MouseEvent } from "react";
import { cn } from "../../../lib/utils";
import { useModalChrome } from "../hooks/useModalChrome";
import type {
  Card,
  CreateCardFromTopicResponse,
} from "../../../lib/discovery-api";

export interface WizardSuccessViewProps {
  isOpen: boolean;
  onClose: () => void;
  createdCard: CreateCardFromTopicResponse | Card;
  researchDepth: "quick" | "deep";
  onCreateAnother: () => void;
}

function getCardName(card: CreateCardFromTopicResponse | Card): string {
  if ("card_name" in card) return card.card_name;
  if ("name" in card) return card.name;
  return "";
}

function getCardPath(card: CreateCardFromTopicResponse | Card): string {
  if ("card_id" in card) return `/signals/${card.card_id}`;
  if ("slug" in card) return `/signals/${card.slug || card.id}`;
  return "/";
}

export function WizardSuccessView({
  isOpen,
  onClose,
  createdCard,
  researchDepth,
  onCreateAnother,
}: WizardSuccessViewProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalChrome({ isOpen, onClose, modalRef });

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center",
        "bg-black/50 dark:bg-black/70",
        "backdrop-blur-sm",
        "overflow-y-auto py-8 sm:py-16",
      )}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-signal-title"
    >
      <div
        ref={modalRef}
        className={cn(
          "relative w-full max-w-2xl mx-4",
          "bg-white dark:bg-dark-surface",
          "rounded-xl shadow-2xl",
          "border border-gray-200 dark:border-gray-700",
          "animate-in fade-in-0 zoom-in-95 duration-200",
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="create-signal-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Signal Created
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={cn(
              "p-1.5 rounded-md",
              "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
              "hover:bg-gray-100 dark:hover:bg-gray-700",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue",
              "transition-colors duration-200",
            )}
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center px-6 py-10 space-y-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40">
            <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Signal Created Successfully
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              &ldquo;{getCardName(createdCard)}&rdquo; has been created and
              {researchDepth === "deep"
                ? " deep research has been queued."
                : " a quick scan has been initiated."}
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Link
              to={getCardPath(createdCard)}
              className={cn(
                "inline-flex items-center px-4 py-2 text-sm font-medium rounded-md",
                "bg-brand-blue text-white hover:bg-brand-dark-blue",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
                "transition-colors duration-200",
              )}
            >
              View Card
            </Link>
            <button
              type="button"
              onClick={onCreateAnother}
              className={cn(
                "inline-flex items-center px-4 py-2 text-sm font-medium rounded-md",
                "bg-white text-gray-700 border border-gray-300",
                "hover:bg-gray-50",
                "dark:bg-dark-surface-elevated dark:text-gray-300 dark:border-gray-600 dark:hover:bg-dark-surface-hover",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
                "transition-colors duration-200",
              )}
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
