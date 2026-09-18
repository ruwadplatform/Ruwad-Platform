"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const REDIRECT_MS = 3000;

/** Reads the raw token from `?token=`. The token is only ever sent to the
 * backend, which is the sole judge of whether it is valid, expired or used
 * — the page has no way to tell, so it just shows the backend's verdict. */
export function ResetPasswordPage() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.push("/login"), REDIRECT_MS);
    return () => clearTimeout(t);
  }, [done, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await resetPassword(token, password, confirm);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && /invalid or has expired/i.test(err.message)) setLinkInvalid(true);
      else setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Please wait a minute and try again." : err instanceof ApiError && err.status === 400 ? err.message : "We couldn't reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
              <p className="fs-14" style={{ marginBottom: 12 }}>Your password has been reset successfully.</p>
              <p className="small muted" style={{ marginBottom: 20 }}>Taking you to the login page…</p>
              <Link href="/login" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px", display: "inline-flex", alignItems: "center" }}>Go to login</Link>
            </>
          ) : linkInvalid ? (
            <>
              <p className="fs-14" style={{ marginBottom: 20 }}>This password reset link is invalid or has expired.</p>
              <Link href="/forgot-password" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px", display: "inline-flex", alignItems: "center" }}>Request a new reset link</Link>
            </>
          ) : (
            <form onSubmit={submit} style={{ display: "contents" }}>
              <div className="field"><label>New password</label><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
              <div className="field"><label>Confirm new password</label><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your new password" /></div>
              {error && <div className="field err" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px" }} disabled={submitting}>{submitting ? "Resetting…" : "Reset Password"}</button>
              <p className="small mt-16"><Link href="/login" style={{ fontWeight: 700, color: "var(--green-dark)" }}>Back to login</Link></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
