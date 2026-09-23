"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";

/** `.input` with our own show/hide eye button inside it. Extracted from ResetPasswordPage
 * (the only place that had one) so Login and Signup get the same toggle — without it, "show
 * password" only worked where the OS/browser happened to draw its own reveal icon (Edge on
 * Windows does; Safari/Chrome on Mac generally don't), which looked like a Mac-only bug. */
export function PasswordInput({ value, onChange, placeholder, autoComplete, label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; label: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input className="input" type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ paddingRight: 42 }} />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-label={`${visible ? "Hide" : "Show"} ${label}`} aria-pressed={visible}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", color: "var(--muted)" }}>
        <RuwadIcon name={visible ? "eye-off" : "eye"} size={16} />
      </button>
    </div>
  );
}
