/**
 * Modal dialog for adding/editing notes on a workstream card. Owns its
 * own draft state, focus trap, escape-to-close, and Cmd/Ctrl+Enter save
 * shortcut. The parent controls visibility via `isOpen` and receives the
 * trimmed notes string via `onSave`.
 *
 * @module components/kanban/CardActions/NotesModal
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, StickyNote, X } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface NotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (notes: string) => void;
  initialNotes: string;
  cardName: string;
  isSaving?: boolean;
}

export const NotesModal = memo(function NotesModal({
  isOpen,
  onClose,
  onSave,
  initialNotes,
  cardName,
  isSaving = false,
}: NotesModalProps) {
  const [notes, setNotes] = useState(initialNotes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNotes(initialNotes);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, initialNotes]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);
    return () => document.removeEventListener("keydown", handleTabKey);
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSaving) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isSaving, onClose]);

  const handleSave = useCallback(() => {
    onSave(notes.trim());
  }, [notes, onSave]);

  // Cmd/Ctrl + Enter to save
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSaving) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave, isSaving],
  );

  if (!isOpen) return null;

  // Portal to <body> so keydown events from the textarea don't bubble up to
  // the parent KanbanCard root, which has dnd-kit drag listeners attached.
  // Without the portal, typing Space in the textarea triggers KeyboardSensor
  // and starts a drag, which unmounts the modal mid-edit.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={isSaving ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-lg transform transition-all duration-200"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-2 min-w-0">
            <StickyNote className="h-5 w-5 text-amber-500 shrink-0" />
            <h2
              id="notes-modal-title"
              className="text-lg font-semibold leading-snug text-gray-900 dark:text-white break-words"
            >
              {initialNotes ? "Edit Notes" : "Add Notes"}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Signal:</span>{" "}
            <span className="text-gray-900 dark:text-white">{cardName}</span>
          </div>

          <div>
            <label
              htmlFor="card-notes"
              className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
            >
              Notes
            </label>
            <textarea
              ref={textareaRef}
              id="card-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add your notes about this signal..."
              disabled={isSaving}
              rows={6}
              className={cn(
                "w-full px-3 py-2 border rounded-md shadow-sm text-sm resize-none",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue",
                "dark:bg-dark-surface-elevated dark:text-white dark:placeholder-gray-400",
                "border-gray-300 bg-white dark:border-gray-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Press Cmd/Ctrl + Enter to save
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-600">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={saveButtonRef}
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface",
              "transition-colors",
              isSaving
                ? "bg-brand-blue/60 cursor-not-allowed"
                : "bg-brand-blue hover:bg-brand-dark-blue",
            )}
            aria-busy={isSaving}
          >
            {isSaving && (
              <Loader2
                className="h-4 w-4 mr-2 animate-spin"
                aria-hidden="true"
              />
            )}
            {isSaving ? "Saving..." : "Save Notes"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
