"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { evaluatePassword, type PasswordStrength } from "@/lib/password-rules";

const REDIRECT_MS = 3000;
const SUCCESS_MESSAGE = "Your password has been reset successfully. You can now sign in with your new password.";
const STRENGTH_STYLE: Record<PasswordStrength, { label: string; color: string; segments: number }> = {
  weak: { label: "Weak", color: "var(--crit)", segments: 1 },
  medium: { label: "Medium", color: "var(--warn)", segments: 2 },
  strong: { label: "Strong", color: "var(--good)", segments: 3 },
};

/** Reads the raw token from `?token=`. The token is only ever sent to the
 * backend, which is the sole judge of whether it is valid, expired or used —
 * the page has no way to tell, so it shows the backend's verdict. The
 * checklist and strength meter are feedback only; the backend enforces the
 * same rules independently. */
export function ResetPasswordPage() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [linkError, setLinkError] = useState(token ? "" : "This password reset link is invalid. Please request a new one.");
  const [error, setError] = useState("");

  const { results, strength, strong } = evaluatePassword(password);
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = !!token && strong && confirm.length > 0 && !mismatch && !submitting;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.push("/login"), REDIRECT_MS);
    return () => clearTimeout(t);
  }, [done, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      await resetPassword(token, password, confirm);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && /reset link (is invalid|has expired)/i.test(err.message)) setLinkError(err.message);
      else if (err instanceof ApiError && err.status === 400) setError(err.message);
      else setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Please wait a minute and try again." : "We couldn't reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const s = STRENGTH_STYLE[strength];

  return (
    <div className="auth-shell">
      <div className="auth-shell-bg" />
      <div className="auth-shell-scrim" />
      <div className="auth-card">
        <div className="auth-card-brand">
          <div className="auth-card-brand-glow" />
          <Link href="/" className="auth-card-logo"><span className="en">RUWĀD</span><span className="ar">روّاد</span></Link>
          <h2>Reset your password</h2>
          <p>Choose a new password for your RUWĀD account.</p>
        </div>
        <div className="auth-card-form">
          {done ? (
            <>
              <p className="fs-14" style={{ marginBottom: 12 }}>{SUCCESS_MESSAGE}</p>
              <p className="small muted" style={{ marginBottom: 20 }}>Taking you to the login page…</p>
              <Link href="/login" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px", display: "inline-flex", alignItems: "center" }}>Go to login</Link>
            </>
          ) : linkError ? (
            <>
              <p className="fs-14" style={{ marginBottom: 20 }}>{linkError}</p>
              <Link href="/forgot-password" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px", display: "inline-flex", alignItems: "center" }}>Request a new reset link</Link>
            </>
          ) : (
            <form onSubmit={submit} style={{ display: "contents" }}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>New password</label>
                <PasswordInput value={password} onChange={setPassword} placeholder="Enter a new password" autoComplete="new-password" label="new password" />
              </div>

              {password.length > 0 && (
                <div style={{ marginBottom: 16 }} aria-live="polite">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 4, flex: 1 }} aria-hidden="true">
                      {[1, 2, 3].map((n) => (
                        <span key={n} style={{ flex: 1, height: 5, borderRadius: 3, background: n <= s.segments ? s.color : "var(--border-strong)", transition: "background .15s" }} />
                      ))}
                    </div>
                    <span className="small" style={{ fontWeight: 700, color: s.color, minWidth: 52, textAlign: "right" }}>{s.label}</span>
                  </div>
                  <div className="small muted" style={{ marginBottom: 6 }}>Password must contain:</div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                    {results.map(({ rule, met }) => (
                      <li key={rule.id} className="small" style={{ display: "flex", alignItems: "center", gap: 8, color: met ? "var(--good)" : "var(--muted)" }}>
                        {met
                          ? <RuwadIcon name="check" size={13} aria-label="met" />
                          : <span aria-label="not met" style={{ width: 13, height: 13, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid currentColor" }} /></span>}
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="field" style={{ marginBottom: 12 }}>
                <label>Confirm new password</label>
                <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repeat your new password" autoComplete="new-password" label="confirm password" />
                {mismatch && <div className="small" role="alert" style={{ color: "var(--crit)", marginTop: 6 }}>Passwords do not match.</div>}
              </div>

              {error && <div className="small" role="alert" style={{ color: "var(--crit)", marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px" }} disabled={!canSubmit}>{submitting ? "Resetting…" : "Reset Password"}</button>
              <p className="small mt-16"><Link href="/login" style={{ fontWeight: 700, color: "var(--green-dark)" }}>Back to login</Link></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
