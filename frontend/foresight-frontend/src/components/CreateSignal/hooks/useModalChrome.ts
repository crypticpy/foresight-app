/**
 * Wires up the three side-effects every modal needs while open:
 *   1. Escape key closes the modal
 *   2. Tab key is trapped inside the modal's focusable elements
 *   3. Body scroll is locked
 *
 * The caller passes a ref to the modal's outermost container so the focus
 * trap can locate its descendants.
 *
 * @module CreateSignal/hooks/useModalChrome
 */

import { useEffect, type RefObject } from "react";

export interface UseModalChromeOptions {
  isOpen: boolean;
  onClose: () => void;
  modalRef: RefObject<HTMLElement>;
}

export function useModalChrome({
  isOpen,
  onClose,
  modalRef,
}: UseModalChromeOptions): void {
  // Escape + focus-trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, modalRef]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);
}
