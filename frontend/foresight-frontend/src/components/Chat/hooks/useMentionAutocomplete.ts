/**
 * Detects an "@" trigger in the chat input as the user types, drives the
 * mention-autocomplete dropdown, and accumulates the selected structured
 * mention payloads (id + type + title) that get sent with the next
 * message.
 *
 * The caller owns the actual <textarea> + its value/setter; this hook
 * just reads the cursor, tracks state, and exposes handlers the input
 * bar can wire up.
 *
 * @module components/Chat/hooks/useMentionAutocomplete
 */

import { useCallback, useRef, useState, type RefObject } from "react";
import type { ChatMention, MentionResult } from "../../../lib/chat-api";

export interface UseMentionAutocompleteOptions {
  inputValue: string;
  setInputValue: (v: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export interface UseMentionAutocompleteResult {
  mentionActive: boolean;
  mentionQuery: string;
  mentionPosition: { top: number; left: number };
  activeMentions: ChatMention[];
  clearActiveMentions: () => void;
  setMentionInactive: () => void;
  inputWrapperRef: RefObject<HTMLDivElement>;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleMentionSelect: (mention: MentionResult) => void;
  handleMentionClose: () => void;
}

export function useMentionAutocomplete({
  inputValue,
  setInputValue,
  textareaRef,
}: UseMentionAutocompleteOptions): UseMentionAutocompleteResult {
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  const [activeMentions, setActiveMentions] = useState<ChatMention[]>([]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart ?? value.length;
      setInputValue(value);

      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex >= 0) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
        const charBefore = lastAtIndex > 0 ? value[lastAtIndex - 1] : " ";
        const isValidTrigger =
          charBefore === " " || charBefore === "\n" || lastAtIndex === 0;
        const isReasonableLength = textAfterAt.length <= 60;
        const isAlreadyCompleted = textAfterAt.includes("]");

        if (isValidTrigger && isReasonableLength && !isAlreadyCompleted) {
          setMentionActive(true);
          setMentionQuery(textAfterAt);
          setMentionStartIndex(lastAtIndex);

          if (inputWrapperRef.current) {
            const wrapperRect = inputWrapperRef.current.getBoundingClientRect();
            setMentionPosition({
              top: 4,
              left: Math.min(lastAtIndex * 8, wrapperRect.width - 288),
            });
          }
          return;
        }
      }

      if (mentionActive) {
        setMentionActive(false);
      }
    },
    [mentionActive, setInputValue],
  );

  const handleMentionSelect = useCallback(
    (mention: MentionResult) => {
      const before = inputValue.slice(0, mentionStartIndex);
      const after = inputValue.slice(
        mentionStartIndex + 1 + mentionQuery.length,
      );
      const mentionText = `@[${mention.title}]`;
      const newValue = before + mentionText + (after || " ");

      setInputValue(newValue);
      setMentionActive(false);
      setMentionQuery("");
      setMentionStartIndex(-1);

      setActiveMentions((prev) => {
        if (prev.some((m) => m.id === mention.id)) return prev;
        return [
          ...prev,
          { id: mention.id, type: mention.type, title: mention.title },
        ];
      });

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = before.length + mentionText.length + 1;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [inputValue, mentionStartIndex, mentionQuery, setInputValue, textareaRef],
  );

  const handleMentionClose = useCallback(() => {
    setMentionActive(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
  }, []);

  const clearActiveMentions = useCallback(() => {
    setActiveMentions([]);
  }, []);

  const setMentionInactive = useCallback(() => {
    setMentionActive(false);
  }, []);

  return {
    mentionActive,
    mentionQuery,
    mentionPosition,
    activeMentions,
    clearActiveMentions,
    setMentionInactive,
    inputWrapperRef,
    handleInputChange,
    handleMentionSelect,
    handleMentionClose,
  };
}
