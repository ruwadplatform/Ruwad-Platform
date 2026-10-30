const SENT_AT_KEY = "ruwad.verify.codeSentAt";

/** Remembers (for this browser tab only) WHEN a verification code was last sent, so the resend countdown on /verify-email is right when the page opens. It never holds a code. */
export function markCodeSent(): void {
  try { sessionStorage.setItem(SENT_AT_KEY, String(Date.now())); } catch { /* storage unavailable: the full wait applies, and the server enforces it anyway */ }
}

export function readCodeSentAt(): number | null {
  try { const v = Number(sessionStorage.getItem(SENT_AT_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
