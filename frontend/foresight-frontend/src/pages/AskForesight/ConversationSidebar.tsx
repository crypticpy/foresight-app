/**
 * The full conversation sidebar for the AskForesight page: New-Chat
 * button, collapse toggle, search input, and either a flat "Results"
 * list (when search is active) or the grouped Today/This Week/Older
 * view. Mobile slide-out behavior is controlled by the parent via
 * `mobileOpen`.
 *
 * @module pages/AskForesight/ConversationSidebar
 */

import React from "react";
import {
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Conversation } from "../../lib/chat-api";
import { ConversationGroup } from "./ConversationGroup";
import { ConversationItem } from "./ConversationItem";
import { groupConversations } from "./utils";

export interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  collapsed: boolean;
  mobileOpen: boolean;
  searchQuery: string;
  searchResults: Conversation[] | null;
  isSearching: boolean;
  onNewChat: () => void;
  onToggleCollapsed: () => void;
  onSearchQueryChange: (q: string) => void;
  onSelect: (conv: Conversation) => void;
  onDelete: (e: React.MouseEvent, convId: string) => void;
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  collapsed,
  mobileOpen,
  searchQuery,
  searchResults,
  isSearching,
  onNewChat,
  onToggleCollapsed,
  onSearchQueryChange,
  onSelect,
  onDelete,
}: ConversationSidebarProps) {
  const grouped = groupConversations(conversations);

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-gray-200 dark:border-gray-700",
        "bg-gray-50 dark:bg-dark-surface-deep",
        "flex flex-col overflow-hidden",
        // Mobile: absolute overlay — always full width
        "fixed md:relative inset-y-0 left-0 z-30 md:z-auto",
        "md:translate-x-0 transition-all duration-300 ease-in-out",
        "top-16 md:top-0",
        mobileOpen
          ? "translate-x-0 w-[280px]"
          : "-translate-x-full md:translate-x-0",
        !mobileOpen && (collapsed ? "md:w-[60px]" : "md:w-[280px]"),
      )}
    >
      <div className="p-3 shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={onNewChat}
          title={collapsed ? "New Chat" : undefined}
          className={cn(
            "inline-flex items-center justify-center gap-2",
            "py-2.5 text-sm font-medium rounded-lg",
            "bg-brand-blue text-white",
            "hover:bg-brand-dark-blue",
            "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
            "transition-colors duration-200",
            collapsed ? "w-9 h-9 px-0 flex-shrink-0" : "flex-1 px-4",
          )}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span>New Chat</span>}
        </button>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "hidden md:inline-flex items-center justify-center",
            "w-7 h-7 rounded-md shrink-0",
            "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
            "hover:bg-gray-200 dark:hover:bg-dark-surface-hover",
            "focus:outline-none focus:ring-1 focus:ring-brand-blue",
            "transition-colors duration-150",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          <div
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 rounded-lg",
              "bg-white dark:bg-dark-surface",
              "border border-gray-200 dark:border-gray-600",
              "focus-within:ring-2 focus-within:ring-brand-blue focus-within:border-transparent",
              "transition-all duration-200",
            )}
          >
            <Search
              className="h-3.5 w-3.5 text-gray-400 shrink-0"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search conversations..."
              className={cn(
                "flex-1 bg-transparent text-sm",
                "text-gray-700 dark:text-gray-300",
                "placeholder-gray-400 dark:placeholder-gray-500",
                "focus:outline-none",
              )}
              aria-label="Search conversations"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-b border-gray-200 dark:border-gray-700 mx-3" />

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {searchResults !== null ? (
          <div>
            {isSearching ? (
              <div className="text-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400 mx-auto" />
                <p className="text-xs text-gray-400 mt-2">Searching...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-6 px-3">
                <p className="text-xs text-gray-400">No conversations found</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="px-2 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Results
                </p>
                {searchResults.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={activeConversationId === conv.id}
                    onSelect={onSelect}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-3">
            <MessageSquare
              className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2"
              aria-hidden="true"
            />
            {!collapsed && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No conversations yet
              </p>
            )}
          </div>
        ) : (
          <>
            {grouped.today.length > 0 && (
              <ConversationGroup
                label="Today"
                conversations={grouped.today}
                activeId={activeConversationId}
                onSelect={onSelect}
                onDelete={onDelete}
                collapsed={collapsed}
              />
            )}
            {grouped.thisWeek.length > 0 && (
              <ConversationGroup
                label="This Week"
                conversations={grouped.thisWeek}
                activeId={activeConversationId}
                onSelect={onSelect}
                onDelete={onDelete}
                collapsed={collapsed}
              />
            )}
            {grouped.older.length > 0 && (
              <ConversationGroup
                label="Older"
                conversations={grouped.older}
                activeId={activeConversationId}
                onSelect={onSelect}
                onDelete={onDelete}
                collapsed={collapsed}
              />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
