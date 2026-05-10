/**
 * Bridges `useSpeechToText` to the chat textarea: appends each finalized
 * transcript onto the current input value, focuses the textarea, and
 * surfaces any speech errors as toast notifications. The hook keeps the
 * mic-toggle behavior as a single callback so the input bar can be
 * agnostic about how recognition is started/stopped.
 *
 * @module components/Chat/hooks/useChatVoiceInput
 */

import { useCallback, useEffect, type RefObject } from "react";
import { useSpeechToText } from "../../../hooks/useSpeechToText";
import { useToast } from "../../ui/Toast";

export interface UseChatVoiceInputOptions {
  setInputValue: (updater: (prev: string) => string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export interface UseChatVoiceInputResult {
  isListening: boolean;
  isSpeechSupported: boolean;
  handleMicToggle: () => void;
}

export function useChatVoiceInput({
  setInputValue,
  textareaRef,
}: UseChatVoiceInputOptions): UseChatVoiceInputResult {
  const {
    isListening,
    isSupported: isSpeechSupported,
    transcript,
    error: speechError,
    startListening,
    stopListening,
  } = useSpeechToText();
  const { pushToast } = useToast();

  useEffect(() => {
    if (speechError) {
      pushToast(speechError, { variant: "error" });
    }
  }, [speechError, pushToast]);

  useEffect(() => {
    if (transcript) {
      setInputValue((prev) => {
        const separator = prev && !prev.endsWith(" ") ? " " : "";
        return prev + separator + transcript;
      });
      textareaRef.current?.focus();
    }
  }, [transcript, setInputValue, textareaRef]);

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return { isListening, isSpeechSupported, handleMicToggle };
}
