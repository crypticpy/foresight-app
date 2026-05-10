/**
 * A bucket header ("Today" / "This Week" / "Older") plus the list of
 * conversation items in that bucket. Hides the header in collapsed
 * mode so the icon-only sidebar stays clean.
 *
 * @module pages/AskForesight/ConversationGroup
 */

import React from "react";
import type { Conversation } from "../../lib/chat-api";
import { ConversationItem } from "./ConversationItem";

export interface ConversationGroupProps {
  label: string;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conv: Conversation) => void;
  onDelete: (e: React.MouseEvent, convId: string) => void;
  collapsed?: boolean;
}

export function ConversationGroup({
  label,
  conversations,
  activeId,
  onSelect,
  onDelete,
  collapsed,
}: ConversationGroupProps) {
  return (
    <div className="mb-3">
      {!collapsed && (
        <p className="px-2 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {label}
        </p>
      )}
      <div className="space-y-0.5">
        {conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            isActive={activeId === conv.id}
            onSelect={onSelect}
            onDelete={onDelete}
            collapsed={collapsed}
          />
        ))}
      </div>
    </div>
  );
}
