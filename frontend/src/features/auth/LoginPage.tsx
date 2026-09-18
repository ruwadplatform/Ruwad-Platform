"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/shell/ToastProvider";
import { login, consumePendingAction, ApiError } from "@/lib/store";

/** Ported from authShell()/loginHtml()/doLogin() (js/auth.js:38-139) — same
 * `.auth-shell`/`.auth-card`/`.auth-card-brand`/`.auth-card-form` markup,
 * same "resume pending action" idea, adapted from hash-routing to the
 * Next.js router. Real backend auth: password is verified server-side
 * (bcrypt against the DB) — no pre-filled credentials, no auto-login. */
export function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function doLogin() {
    setSubmitting(true);
    try {
      const acc = await login(email.trim(), password);
      toast(`Welcome back, ${acc.firstName}!`);
      const pending = consumePendingAction();
      router.push(pending?.route && pending.route !== "/login" ? pending.route : "/dashboard");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Invalid email or password");
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
          <h2>Welcome to RUWĀD</h2>
          <p>Log in to get started. New to RUWĀD? <Link href="/signup">Create an account</Link></p>
        </div>
        <div className="auth-card-form">
          <div className="field"><label>Email</label><input className="input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email (e.g., email@company.com)" /></div>
          <div className="field"><label>Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
          <div className="flex mb-16" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <label className="fs-12" style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
            </label>
            <Link href="/forgot-password" className="small" style={{ fontWeight: 700, color: "var(--green-dark)" }}>Forgot your password?</Link>
          </div>
          <button className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start", padding: "0 32px" }} onClick={doLogin} disabled={submitting}>{submitting ? "Logging in…" : "Log in"}</button>
        </div>
      </div>
    </div>
  );
}
