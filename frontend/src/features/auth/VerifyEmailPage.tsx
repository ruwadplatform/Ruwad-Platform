"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shell/ToastProvider";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import * as authApi from "@/lib/api/auth";
import { verifyEmailCode, consumePendingAction } from "@/lib/store";
import { OtpInput } from "./OtpInput";
import { markCodeSent, readCodeSentAt } from "./verify-email-session";
import { RESEND_SECONDS, SUPPORT_EMAIL, digitsToCode, emptyCode, formatCountdown, initialResendWait, isComplete, messageFor, secondsLeft } from "./verify-email-logic";

/** /verify-email: the screen a new member lands on after signing up (or after logging in with an address that is not verified yet). They enter the 6-digit code sent to
 * their email. The server decides everything that matters (expiry, attempts, limits); this screen only collects the code and says plainly what happened. */
export function VerifyEmailPage() {
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<"loading" | "ready" | "verified">("loading");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(emptyCode());
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendUntil, setResendUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    authApi.pendingVerification()
      .then((r) => { if (alive) { setMaskedEmail(r.pending ? r.maskedEmail : null); setResendUntil(Date.now() + initialResendWait(readCodeSentAt(), Date.now()) * 1000); setPhase("ready"); } })
      .catch(() => { if (alive) { setMaskedEmail(null); setPhase("ready"); } });
    return () => { alive = false; };
  }, []);

  const remaining = secondsLeft(resendUntil, now);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const needsEmail = maskedEmail === null;
  const typedEmail = email.trim();

  async function submit() {
    if (busy) return;
    if (needsEmail && !typedEmail) { setError("Enter the email address you signed up with."); return; }
    if (!isComplete(digits)) { setError("Enter all 6 digits of the code."); return; }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await verifyEmailCode(digitsToCode(digits), needsEmail ? typedEmail : undefined);
      if (res.signedIn) {
        toast(`Email verified. Welcome${res.firstName ? `, ${res.firstName}` : ""}!`);
        const pending = consumePendingAction();
        router.push(pending?.route && pending.route !== "/verify-email" ? pending.route : "/dashboard");
        return;
      }
      setPhase("verified");
    } catch (e) {
      setError(messageFor(e).text);
      setDigits(emptyCode());
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || remaining > 0) return;
    if (needsEmail && !typedEmail) { setError("Enter the email address you signed up with, then ask for a new code."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await authApi.resendVerification(needsEmail ? typedEmail : undefined);
      setInfo(r.message);
      setDigits(emptyCode());
      markCodeSent();
      setNow(Date.now());
      setResendUntil(Date.now() + (r.resendAfterSeconds || RESEND_SECONDS) * 1000);
    } catch (e) {
      const shown = messageFor(e);
      setError(shown.text);
      if (shown.retryAfter) { setNow(Date.now()); setResendUntil(Date.now() + shown.retryAfter * 1000); }
    } finally {
      setBusy(false);
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
          <h2>{phase === "verified" ? "Email verified" : "Check your email"}</h2>
          <p>{phase === "verified" ? "Your address is confirmed." : "We protect every RUWĀD account by confirming the email address behind it."}</p>
        </div>
        <div className="auth-card-form">
          {phase === "loading" && <p className="muted fs-13" role="status">Loading…</p>}

          {phase === "verified" && (
            <div style={{ textAlign: "center" }}>
              <div className="modal-icon-ok" style={{ width: 64, height: 64, margin: "0 auto" }}><RuwadIcon name="check" size={30} /></div>
              <h2 className="fs-19 mt-16">Your email is verified</h2>
              <p className="muted fs-13" style={{ marginTop: 6 }}>You can now log in to your RUWĀD account.</p>
              <Link className="btn btn-primary btn-lg mt-24" href="/login">Log in</Link>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
              <h2 className="fs-19" style={{ marginBottom: 6 }}>Verify your email</h2>
              <p className="muted fs-13" style={{ marginBottom: 18 }}>
                {needsEmail
                  ? "Enter the email address you signed up with, then the 6-digit code we sent to it."
                  : <>We sent a 6-digit code to <b>{maskedEmail}</b>. Enter it below to finish creating your account. It expires in 10 minutes.</>}
              </p>

              {needsEmail && (
                <div className="field"><label htmlFor="verify-email-address">Email</label>
                  <input id="verify-email-address" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" />
                </div>
              )}

              <div className="field">
                <label id="verify-code-label">Verification code</label>
                <OtpInput digits={digits} onChange={(d) => { setDigits(d); if (error) setError(""); }} onEnter={() => void submit()} disabled={busy} invalid={!!error} autoFocus label="Verification code, 6 digits" />
              </div>

              <div aria-live="polite" style={{ minHeight: 22 }}>
                {error && <p className="otp-message otp-error" role="alert">{error}</p>}
                {!error && info && <p className="otp-message otp-info" role="status">{info}</p>}
              </div>

              <button type="submit" className="btn btn-primary btn-lg mt-8" style={{ alignSelf: "flex-start", padding: "0 32px" }} disabled={busy || !isComplete(digits)}>{busy ? "Checking…" : "Verify email"}</button>

              <div className="otp-help">
                <p>
                  Didn&apos;t get it?{" "}
                  <button type="button" className="otp-link" onClick={() => void resend()} disabled={busy || remaining > 0}>
                    {remaining > 0 ? `Send a new code in ${formatCountdown(remaining)}` : "Send a new code"}
                  </button>
                </p>
                <p className="muted">Check your spam folder. A new code replaces the old one. Wrong address? <Link href="/signup">Start again</Link>. Already verified? <Link href="/login">Log in</Link>.</p>
                <p className="muted">Still stuck? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
