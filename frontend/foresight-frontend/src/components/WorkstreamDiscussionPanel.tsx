/**
 * Slide-out panel that renders a CommentThread scoped to a workstream.
 *
 * Mirrors WorkstreamChatPanel's drawer shell so the kanban page can ship
 * a "Discussion" button alongside the existing Chat button. Backed by the
 * shared comments router (target_type="workstream"); when the
 * collaboration feature flag is off the thread renders its own graceful
 * empty state, so no caller-side flag check is needed.
 *
 * @module components/WorkstreamDiscussionPanel
 */

import { useEffect } from "react";
import { X } from "lucide-react";

import { cn } from "../lib/utils";
import { CommentThread } from "./comments/CommentThread";

export interface WorkstreamDiscussionPanelProps {
  workstreamId: string;
  workstreamName: string;
  isOpen: boolean;
  onClose: () => void;
  /** Whether the current user can post (false for read-only viewers). */
  canComment: boolean;
}

export function WorkstreamDiscussionPanel({
  workstreamId,
  workstreamName,
  isOpen,
  onClose,
  canComment,
}: WorkstreamDiscussionPanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 h-full z-50 bg-white dark:bg-dark-surface-deep",
          "border-l border-gray-200 dark:border-gray-700",
          "shadow-2xl transition-transform duration-300 ease-in-out",
          "w-full sm:w-[480px]",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="Workstream discussion"
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
              Workstream discussion
            </h3>
            <p className="max-w-[340px] text-xs leading-snug text-gray-500 dark:text-gray-400 break-words">
              {workstreamName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-dark-surface-hover transition-colors"
            aria-label="Close discussion panel"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="h-[calc(100%-3.5rem)] overflow-y-auto px-4 py-4">
          {isOpen && (
            <CommentThread
              targetType="workstream"
              targetId={workstreamId}
              workstreamId={workstreamId}
              canComment={canComment}
              title="Team discussion"
              emptyHint="Use this space to coordinate inside the workstream — separate from signal-level threads."
            />
          )}
        </div>
      </div>
    </>
  );
}

export default WorkstreamDiscussionPanel;
