/**
 * Full-page AI-powered chat interface for natural-language queries
 * against the Foresight intelligence system. Wires together the state
 * hook, the scope selector, the conversation sidebar, and the reusable
 * ChatPanel component.
 *
 * @module pages/AskForesight
 */

import { Menu, X } from "lucide-react";
import { cn } from "../lib/utils";
import { ChatPanel } from "../components/Chat/ChatPanel";
import { ScopeSelector } from "./AskForesight/ScopeSelector";
import { ConversationSidebar } from "./AskForesight/ConversationSidebar";
import { useAskForesightState } from "./AskForesight/useAskForesightState";

export default function AskForesight() {
  const state = useAskForesightState();

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-white dark:bg-dark-surface-deep">
      {/* Header bar */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2",
          "border-b border-gray-200 dark:border-gray-700",
          "bg-white dark:bg-dark-surface-deep",
          "shrink-0",
        )}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => state.setSidebarOpen(!state.sidebarOpen)}
            className={cn(
              "md:hidden inline-flex items-center justify-center",
              "w-8 h-8 rounded-lg",
              "text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-surface-hover",
              "transition-colors duration-200",
            )}
            aria-label="Toggle conversation sidebar"
          >
            {state.sidebarOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <ScopeSelector
            selectedScope={state.selectedScope}
            scopeOptions={state.scopeOptions}
            isOpen={state.scopeDropdownOpen}
            onToggle={() =>
              state.setScopeDropdownOpen(!state.scopeDropdownOpen)
            }
            onClose={() => state.setScopeDropdownOpen(false)}
            onSelect={state.handleScopeChange}
          />
        </div>

        <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
          Powered by Foresight AI
        </span>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        <ConversationSidebar
          conversations={state.conversations}
          activeConversationId={state.activeConversationId}
          collapsed={state.sidebarCollapsed}
          mobileOpen={state.sidebarOpen}
          searchQuery={state.searchQuery}
          searchResults={state.searchResults}
          isSearching={state.isSearching}
          onNewChat={state.handleNewChat}
          onToggleCollapsed={state.toggleSidebarCollapsed}
          onSearchQueryChange={state.setSearchQuery}
          onSelect={state.handleSelectConversation}
          onDelete={state.handleDeleteConversation}
        />

        {/* Mobile sidebar backdrop */}
        {state.sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            onClick={() => state.setSidebarOpen(false)}
          />
        )}

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatPanel
            key={state.chatKey}
            scope={state.effectiveScope}
            scopeId={state.effectiveScopeId}
            initialQuery={state.initialQuery}
            initialConversationId={state.activeConversationId ?? undefined}
            onConversationChange={state.handleConversationChange}
            forceNew={state.forceNewChat}
            className="flex-1"
            placeholder="Ask Foresight about signals, trends, and strategy..."
            emptyStateTitle="What would you like to explore?"
            emptyStateDescription="Ask questions about signals, emerging trends, strategic priorities, and more. Foresight uses AI to synthesize intelligence from your data."
          />
        </div>
      </div>
    </div>
  );
}
