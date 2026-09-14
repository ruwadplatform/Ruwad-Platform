"use client";

import { useAuthGateModal } from "./AuthGateModal";

/** Ported verbatim from lockedTeaser() (js/auth-gate.js:62-69). */
export function LockedTeaser({
  preview, blurLines = 3, cta = "Unlock Full Intelligence", title = "Unlock this intelligence", body, benefits,
}: { preview?: string; blurLines?: number; cta?: string; title?: string; body?: string; benefits?: string[] }) {
  const openAuthGate = useAuthGateModal();
  return (
    <div className="locked-teaser">
      {preview && <div className="lt-preview">{preview}</div>}
      <div className="lt-bars">
        {Array.from({ length: blurLines }).map((_, i) => <div key={i} className="lt-bar" style={{ width: `${88 - i * 14}%` }} />)}
      </div>
      <button className="btn btn-outline btn-sm mt-8" onClick={() => openAuthGate({ title, body, benefits })}>{cta}</button>
    </div>
  );
}
