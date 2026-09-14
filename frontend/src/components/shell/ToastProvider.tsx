"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/** React port of toast(msg) (js/store.js) — same #toast/.show pattern,
 * same 2200ms auto-hide. */
type ToastFn = (msg: string) => void;
const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`toast${msg ? " show" : ""}`} id="toast">
        {msg && <span>{msg}</span>}
      </div>
    </ToastContext.Provider>
  );
}
