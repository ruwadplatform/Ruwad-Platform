"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/shell/ToastProvider";
import { registerAccount, ApiError } from "@/lib/store";

const ACCOUNT_TYPES = [
  "Startup Founder", "Investor", "Hub / Accelerator", "Corporate", "Government", "Researcher / Academia", "Explorer",
] as const;

const ACCOUNT_TYPE_TO_ROLE: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  "Startup Founder": "FOUNDER",
  Investor: "INVESTOR",
  "Hub / Accelerator": "ORGANIZATION_ADMIN",
  Corporate: "ORGANIZATION_ADMIN",
  Government: "ORGANIZATION_ADMIN",
  "Researcher / Academia": "ORGANIZATION_ADMIN",
  Explorer: "USER",
};

/** Simplified, single-screen port of signupHtml()'s account-creation step
 * (js/auth.js:184-313) — the old app's 4-step wizard (account type →
 * personal info → organization → interests) is condensed to one screen.
 * Real backend account: bcrypt-hashed password, a genuine `users` row —
 * account type maps to the backend's role enum. */
export function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const [accountType, setAccountType] = useState<string>(ACCOUNT_TYPES[0]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [country, setCountry] = useState("Saudi Arabia");
  const [city, setCity] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || password !== confirm || !agree) {
      setError("Please complete all required fields correctly.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await registerAccount({
        email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(),
        role: ACCOUNT_TYPE_TO_ROLE[accountType as (typeof ACCOUNT_TYPES)[number]],
        jobTitle: jobTitle.trim() || undefined, country: country.trim() || undefined, city: city.trim() || undefined,
      });
      toast("Welcome to RUWĀD — your workspace is ready.");
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-shell-bg" />
      <div className="auth-shell-scrim" />
      <div className="auth-card wide">
        <div className="auth-card-brand">
          <div className="auth-card-brand-glow" />
          <Link href="/" className="auth-card-logo"><span className="en">RUWĀD</span><span className="ar">روّاد</span></Link>
          <h2>Create your RUWĀD workspace</h2>
          <p>Already have an account? <Link href="/login">Log in</Link></p>
        </div>
        <div className="auth-card-form">
          <h2 className="fs-16">Account Type</h2>
          <div className="field mt-8">
            <select className="select" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <h2 className="fs-16 mt-8">Personal Information</h2>
          <div className="grid-2 mt-16">
            <div className="field"><label>First Name <span className="req">*</span></label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="field"><label>Last Name <span className="req">*</span></label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div className="field field-full"><label>Work Email <span className="req">*</span></label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Password <span className="req">*</span></label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="field"><label>Confirm Password <span className="req">*</span></label><input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            <div className="field"><label>Job Title</label><input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
            <div className="field"><label>Country</label><input className="input" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
            <div className="field field-full"><label>City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
          </div>
          <label className="fs-12" style={{ display: "flex", gap: 8, margin: "6px 0 20px" }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to RUWĀD Terms of Use and Privacy Policy
          </label>
          {error && <div className="field err" style={{ display: "flex", marginBottom: 12 }}><span>{error}</span></div>}
          <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={submitting}>{submitting ? "Creating your workspace…" : "Complete Setup"}</button>
        </div>
      </div>
    </div>
  );
}
