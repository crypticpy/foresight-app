/**
 * Public types for the useChat hook — options accepted by callers
 * and the return contract exposed to consuming components.
 *
 * @module hooks/useChat/types
 */

import type { ChatMention, ChatMessage, Citation } from "../../lib/chat-api";

export interface UseChatOptions {
  /** The scope context for this chat session */
  scope: "signal" | "workstream" | "global";
  /** ID of the scoped entity (card_id or workstream_id), if not global */
  scopeId?: string;
  /** Resume an existing conversation by ID */
  initialConversationId?: string;
  /** Skip auto-restoring the most recent conversation (e.g., user clicked "New Chat") */
  forceNew?: boolean;
}

export interface UseChatReturn {
  /** Committed messages in the conversation */
  messages: ChatMessage[];
  /** Whether the assistant is currently streaming a response */
  isStreaming: boolean;
  /** Accumulated text content being streamed */
  streamingContent: string;
  /** Citations received during the current stream */
  streamingCitations: Citation[];
  /** The active conversation ID, or null for a new conversation */
  conversationId: string | null;
  /** Title of the active conversation, if loaded */
  conversationTitle: string | null;
  /** ISO 8601 timestamp when the active conversation was last updated */
  conversationUpdatedAt: string | null;
  /** Contextual question suggestions */
  suggestedQuestions: string[];
  /** Current error message, if any */
  error: string | null;
  /** Send a user message and begin streaming the assistant response */
  sendMessage: (message: string, mentions?: ChatMention[]) => Promise<void>;
  /** Abort the current streaming response */
  stopGenerating: () => void;
  /** Load an existing conversation by ID */
  loadConversation: (conversationId: string) => Promise<void>;
  /** Clear messages and start a fresh conversation */
  startNewConversation: () => void;
  /** Fetch fresh suggested questions for the current scope */
  loadSuggestions: () => Promise<void>;
  /** Retry the last failed message */
  retryLastMessage: () => void;
  /** Current streaming progress step */
  progressStep: { step: string; detail: string } | null;
  /** Metadata about the last response (source counts, etc.) */
  responseMetadata: Record<string, unknown> | null;
  /** A rotating fun fact about the user's data */
  funFact: string | null;
}
