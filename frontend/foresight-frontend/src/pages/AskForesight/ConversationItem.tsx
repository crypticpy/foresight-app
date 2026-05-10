/**
 * A single conversation entry in the AskForesight sidebar. Renders an
 * icon-only chip in collapsed mode, or a full row with title, scope
 * badge, relative timestamp, and a hover-revealed delete button when
 * expanded. Scrolls itself into view when it becomes active.
 *
 * @module pages/AskForesight/ConversationItem
 */

import React, { useEffect, useRef } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Conversation } from "../../lib/chat-api";
import { relativeTime, scopeBadgeClasses, scopeLabel } from "./utils";

export interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conv: Conversation) => void;
  onDelete: (e: React.MouseEvent, convId: string) => void;
  collapsed?: boolean;
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  collapsed,
}: ConversationItemProps) {
  const itemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isActive]);

  if (collapsed) {
    return (
      <button
        ref={itemRef}
        type="button"
        onClick={() => onSelect(conversation)}
        title={conversation.title || "Untitled conversation"}
        className={cn(
          "w-full flex items-center justify-center",
          "p-2 rounded-lg",
          "transition-colors duration-150",
          isActive
            ? "bg-brand-blue/10 dark:bg-brand-blue/20"
            : "hover:bg-gray-100 dark:hover:bg-dark-surface-hover",
        )}
      >
        <MessageSquare
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-brand-blue" : "text-gray-400 dark:text-gray-500",
          )}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <button
      ref={itemRef}
      type="button"
      onClick={() => onSelect(conversation)}
      className={cn(
        "w-full group flex items-start gap-2 px-2 py-2 rounded-lg text-left",
        "transition-colors duration-150",
        isActive
          ? "bg-brand-blue/10 dark:bg-brand-blue/20"
          : "hover:bg-gray-100 dark:hover:bg-dark-surface-hover",
      )}
    >
      <MessageSquare
        className={cn(
          "h-4 w-4 shrink-0 mt-0.5",
          isActive ? "text-brand-blue" : "text-gray-400 dark:text-gray-500",
        )}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm truncate",
            isActive
              ? "text-brand-blue font-medium"
              : "text-gray-700 dark:text-gray-300",
          )}
        >
          {conversation.title || "Untitled conversation"}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium",
              scopeBadgeClasses(conversation.scope),
            )}
          >
            {scopeLabel(conversation.scope)}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {relativeTime(conversation.updated_at)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => onDelete(e, conversation.id)}
        className={cn(
          "shrink-0 p-1 rounded opacity-0 group-hover:opacity-100",
          "text-gray-400 hover:text-red-500",
          "hover:bg-red-50 dark:hover:bg-red-900/20",
          "focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-400",
          "transition-all duration-150",
        )}
        aria-label={`Delete conversation: ${conversation.title || "Untitled"}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </button>
  );
}
