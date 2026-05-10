/**
 * Top bar shown above the chat once at least one message has been sent.
 * Renders the scope-history popover (browse past conversations) plus a
 * compact "New Chat" button.
 *
 * @module components/Chat/components/ChatHeader
 */

import { Plus } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ChatHistoryPopover } from "../ChatHistoryPopover";

export interface ChatHeaderProps {
  scope: "signal" | "workstream" | "global";
  scopeId?: string;
  activeConversationId: string | null | undefined;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export function ChatHeader({
  scope,
  scopeId,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: ChatHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-2",
        "border-b border-gray-200 dark:border-gray-700",
        "bg-white/80 dark:bg-dark-surface-deep/80 backdrop-blur-sm",
      )}
    >
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Chat
      </span>
      <div className="flex items-center gap-1">
        <ChatHistoryPopover
          scope={scope}
          scopeId={scopeId}
          activeConversationId={activeConversationId}
          onSelect={onSelectConversation}
          onNewChat={onNewConversation}
        />
        <button
          type="button"
          onClick={onNewConversation}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md",
            "text-gray-600 dark:text-gray-400",
            "hover:bg-gray-100 dark:hover:bg-dark-surface-hover",
            "focus:outline-none focus:ring-2 focus:ring-brand-blue",
            "transition-colors duration-200",
          )}
          aria-label="Start new conversation"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New Chat
        </button>
      </div>
    </div>
  );
}
