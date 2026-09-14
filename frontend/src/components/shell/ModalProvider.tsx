"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/** React port of openModal(html, wide)/closeModal() (js/modals.js) — same
 * #modalOverlay/.modal-box markup, same wide/xwide size classes and
 * click-outside-to-close behavior, just driven by state instead of
 * innerHTML. */
type ModalSize = "" | "wide" | "xwide";
interface ModalContextValue {
  openModal: (content: ReactNode, size?: ModalSize) => void;
  closeModal: () => void;
}
const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const [size, setSize] = useState<ModalSize>("");

  const openModal = useCallback((c: ReactNode, s: ModalSize = "") => {
    setContent(c);
    setSize(s);
  }, []);
  const closeModal = useCallback(() => setContent(null), []);

  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      <div
        className={`modal-overlay${content ? " open" : ""}`}
        id="modalOverlay"
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div className={`modal-box${size ? " " + size : ""}`} id="modalBody">
          {content}
        </div>
      </div>
    </ModalContext.Provider>
  );
}
