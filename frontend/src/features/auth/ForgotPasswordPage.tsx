"use client";

import { useState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

/** Same `.auth-shell`/`.auth-card` layout as LoginPage. The confirmation is
 * deliberately identical whether or not the address has an account — the
 * backend answers the same way, and the UI never hints at either outcome. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address for your account.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      // Only throttling/validation/network failures reach here — never an
      // account-existence signal.
      setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Please wait a minute and try again." : "We couldn't send the request. Please try again.");
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
          <h2>Forgot your password?</h2>
          <p>Enter your email and we&apos;ll send you a link to choose a new one.</p>
        </div>
        <form className="auth-card-form" onSubmit={submit}>
          {sent ? (
            <>
              <p className="fs-14" style={{ marginBottom: 16 }}>If an account exists for this email, we&apos;ve sent a password reset link.</p>
              <p className="small muted" style={{ marginBottom: 20 }}>The link expires in 30 minutes. Check your spam folder if it doesn&apos;t arrive.</p>
              <Link href="/login" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px", display: "inline-flex", alignItems: "center" }}>Back to login</Link>
            </>
          ) : (
            <>
              <div className="field">
                <label>Email address</label>
                <input className="input" type="email" autoComplete="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="email@company.com" />
              </div>
              {error && <div className="field err" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px" }} disabled={submitting}>{submitting ? "Sending…" : "Send Reset Link"}</button>
              <p className="small mt-16"><Link href="/login" style={{ fontWeight: 700, color: "var(--green-dark)" }}>Back to login</Link></p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
