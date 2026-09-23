"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { registerAccount, consumePendingAction, ApiError } from "@/lib/store";
import { parseResume } from "@/lib/api/resume-parse";
import { ALL_COUNTRIES } from "@/data/reference";
import { dialCodeForCountry } from "@/data/phone-codes";
import { toE164, splitE164ForAutofill } from "@/lib/phone";

const ALLOWED_RESUME_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

const ACCOUNT_TYPES = [
  { id: "founder", label: "Startup Founder", desc: "Build your startup profile and connect with investors.", icon: "mystartup" },
  { id: "investor", label: "Investor", desc: "Discover companies and manage investment opportunities.", icon: "investors" },
  { id: "hub", label: "Hub / Accelerator", desc: "Showcase your programs and startup support.", icon: "hubs" },
  { id: "corporate", label: "Corporate", desc: "Discover technologies and partnership opportunities.", icon: "corp" },
  { id: "government", label: "Government", desc: "Explore ecosystem intelligence.", icon: "building" },
  { id: "researcher", label: "Researcher / Academia", desc: "Discover healthcare innovation and research.", icon: "research" },
  { id: "explorer", label: "Explorer", desc: "Browse the ecosystem.", icon: "globe" },
] as const satisfies { id: string; label: string; desc: string; icon: RuwadIconName }[];

type AccountTypeId = (typeof ACCOUNT_TYPES)[number]["id"];

const ACCOUNT_TYPE_TO_ROLE: Record<AccountTypeId, string> = {
  founder: "FOUNDER",
  investor: "INVESTOR",
  hub: "ORGANIZATION_ADMIN",
  corporate: "ORGANIZATION_ADMIN",
  government: "ORGANIZATION_ADMIN",
  researcher: "ORGANIZATION_ADMIN",
  explorer: "USER",
};

const HC_CATEGORIES = [
  "Biotechnology", "MedTech", "Digital Health", "Diagnostics", "AI Healthcare",
  "Pharmaceuticals", "Medical Devices", "Genomics", "Precision Medicine",
  "Telemedicine", "Therapeutics", "Health Data", "Preventive Health",
  "Healthcare Services", "Healthcare IT", "CRO", "CDMO", "Manufacturing", "Other",
];
const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];
const INVESTOR_TYPES = ["VC", "Corporate VC", "Sovereign", "Family Office", "Angel Network", "Venture Studio", "Accelerator", "Government Fund"];
const INTEREST_SECTORS = HC_CATEGORIES.slice(0, 13);
const INTEREST_EXTRA = ["Startup Funding", "Investment Opportunities", "Research", "Regulatory", "Partnerships", "Accelerators", "Market Intelligence"];

const STEP_LABELS = ["Account Type", "Personal Info", "Organization", "Interests"];

interface OrgData {
  name: string; website: string; stage: string; category: string; city: string; type: string;
}

/** Same `.field.err` banner used across all four steps — now with a real
 * dismiss control (the X previously just sat there as a static icon, not
 * an actual button, which read as broken). */
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="field err" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", color: "inherit" }}>
        <RuwadIcon name="x" size={13} />
      </button>
    </div>
  );
}

/** Port of the old app's 4-step signup wizard (js/auth.js:184-322) — same
 * steps, same DOM/CSS classes (.grid-3 account-type cards, .chip-select
 * interests), same per-account-type Organization step fields. Only the
 * final "Complete Setup" step calls the real backend (register a genuine
 * bcrypt-hashed account) — earlier steps just collect local state, same
 * as the old app's SIGNUP_DATA object. Every field collected across all
 * four steps is persisted on the User entity (organization sub-fields and
 * interests included). */
export function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [accountType, setAccountType] = useState<AccountTypeId | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [country, setCountry] = useState("Saudi Arabia");
  const [city, setCity] = useState("");
  const [phoneIso2, setPhoneIso2] = useState(dialCodeForCountry("Saudi Arabia")?.iso2 ?? "SA");
  const [phoneNumber, setPhoneNumber] = useState("");
  // Once the user has picked a phone country themselves (directly, or indirectly by already having
  // a number filled in), changing the Country field stops moving the phone selector along with it —
  // matching how résumé autofill never overwrites a value the user already entered.
  const [phoneCountryTouched, setPhoneCountryTouched] = useState(false);
  const [agree, setAgree] = useState(false);
  const [org, setOrg] = useState<OrgData>({ name: "", website: "", stage: STAGES[0], category: HC_CATEGORIES[0], city: "", type: INVESTOR_TYPES[0] });
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [orgError, setOrgError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resumeFileName, setResumeFileName] = useState("");
  type ResumeStage = "idle" | "uploading" | "extracting" | "analyzing" | "done";
  const [resumeStage, setResumeStage] = useState<ResumeStage>("idle");
  const resumeParsing = resumeStage !== "idle" && resumeStage !== "done";
  const [resumeNote, setResumeNote] = useState(""); // success/partial note shown after a completed autofill
  const [resumeError, setResumeError] = useState("");
  const resumeInputRef = useRef<HTMLInputElement>(null);

  function toggleInterest(label: string) {
    setInterests((prev) => (prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]));
  }

  /** Only fills a field the user hasn't already typed something into — a manual entry always wins,
   * whether it was made before the upload or while the résumé was still being read. */
  function fillIfEmpty(setter: (v: (prev: string) => string) => void, value: string | undefined) {
    if (!value) return;
    setter((prev) => (prev.trim() ? prev : value));
  }

  /** Country change from the Country field itself: also moves the phone dial-code along, unless the
   * user has already chosen a phone country of their own. */
  function changeCountry(next: string) {
    setCountry(next);
    if (!phoneCountryTouched) {
      const match = dialCodeForCountry(next);
      if (match) setPhoneIso2(match.iso2);
    }
  }

  /** Phone country changed directly (the dial-code dropdown itself) — from here on, Country no
   * longer drags the phone selector along with it. */
  function changePhoneIso2(iso2: string) {
    setPhoneIso2(iso2);
    setPhoneCountryTouched(true);
  }

  async function handleResumeFile(file: File | undefined) {
    if (!file) return;
    setResumeError("");
    setResumeNote("");
    if (!ALLOWED_RESUME_TYPES.includes(file.type)) {
      setResumeError("Must be a PDF or Word (.docx) document.");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setResumeError("Must be 5MB or smaller.");
      return;
    }
    setResumeFileName(file.name);
    setResumeStage("uploading");
    // Purely cosmetic staging — the parse is one request/response, but the user should see it isn't stuck.
    const t1 = setTimeout(() => setResumeStage((s) => (s === "uploading" ? "extracting" : s)), 600);
    const t2 = setTimeout(() => setResumeStage((s) => (s === "extracting" ? "analyzing" : s)), 1800);
    try {
      const fields = await parseResume(file);
      fillIfEmpty(setFirstName, fields.firstName);
      fillIfEmpty(setLastName, fields.lastName);
      fillIfEmpty(setEmail, fields.email);
      fillIfEmpty(setJobTitle, fields.jobTitle);
      const country = fields.country ? ALL_COUNTRIES.find((c) => c.toLowerCase() === fields.country!.toLowerCase()) : undefined;
      fillIfEmpty(setCountry, country);
      fillIfEmpty(setCity, fields.city);
      if (fields.phone && !phoneNumber.trim()) {
        const split = splitE164ForAutofill(fields.phone);
        if (split) {
          setPhoneNumber(split.number);
          if (!phoneCountryTouched) setPhoneIso2(split.iso2);
        } else {
          // A local-format number with no dialing code — fill the digits, leave the country selector alone.
          setPhoneNumber(fields.phone.replace(/[^\d\s()-]/g, "").trim());
        }
      }
      if (fields.organization) setOrg((prev) => (prev.name.trim() ? prev : { ...prev, name: fields.organization! }));
      setResumeNote(
        fields.mode === "local"
          ? "AI reading isn't available right now, so only clearly labelled details were picked up — please fill in the rest."
          : "",
      );
      setResumeStage("done");
    } catch (e) {
      setResumeError(e instanceof ApiError ? e.message : "Couldn't read that file — please fill in the fields manually.");
      setResumeFileName("");
      setResumeStage("idle");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  }

  function submitStep2() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || password !== confirm
      || !jobTitle.trim() || !country.trim() || !phoneNumber.trim() || !agree) {
      setError("Please complete all required fields correctly.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!toE164(phoneIso2, phoneNumber)) {
      setError("Please enter a valid phone number.");
      return;
    }
    setError("");
    setStep(3);
  }

  function submitStep3() {
    const requiredFilled =
      accountType === "founder"
        ? org.name.trim() && org.city.trim()
        : accountType === "investor"
          ? org.name.trim() && org.city.trim()
          : org.name.trim() && org.type.trim();
    if (!requiredFilled) {
      setOrgError("Please complete all required fields.");
      return;
    }
    setOrgError("");
    setStep(4);
  }

  async function completeSignup() {
    setSubmitting(true);
    setError("");
    try {
      // Only the org sub-fields actually shown for the selected account
      // type get sent — same as the old app blanking whichever fields
      // weren't part of the rendered step 3 branch.
      const orgFields =
        accountType === "founder"
          ? { organizationWebsite: org.website, organizationStage: org.stage, organizationCategory: org.category, organizationCity: org.city }
          : accountType === "investor"
            ? { organizationType: org.type, organizationStage: org.stage, organizationCity: org.city }
            : { organizationType: org.type, organizationWebsite: org.website };
      await registerAccount({
        email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(),
        role: accountType ? ACCOUNT_TYPE_TO_ROLE[accountType] : "USER",
        jobTitle: jobTitle.trim() || undefined, organization: org.name.trim() || undefined,
        ...Object.fromEntries(Object.entries(orgFields).map(([k, v]) => [k, v?.trim() || undefined])),
        country: country.trim() || undefined, city: city.trim() || undefined,
        phone: toE164(phoneIso2, phoneNumber) ?? undefined,
        interests: interests.length ? interests : undefined,
      });
      setStep(5);
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
      <div className={`auth-card ${step !== 5 ? "wide" : ""}`}>
        <div className="auth-card-brand">
          <div className="auth-card-brand-glow" />
          <Link href="/" className="auth-card-logo"><span className="en">RUWĀD</span><span className="ar">روّاد</span></Link>
          <h2>Create your RUWĀD workspace</h2>
          <p>Already have an account? <Link href="/login">Log in</Link></p>
        </div>
        <div className="auth-card-form">
          {step === 5 ? (
            <div style={{ textAlign: "center" }}>
              <div className="modal-icon-ok" style={{ width: 64, height: 64, margin: "0 auto" }}><RuwadIcon name="check" size={30} /></div>
              <h2 className="fs-19 mt-16">Welcome to RUWĀD</h2>
              <p className="muted fs-13" style={{ marginTop: 6 }}>Your workspace has been created.</p>
              <button className="btn btn-primary btn-lg mt-24" onClick={() => { const pending = consumePendingAction(); router.push(pending?.route && pending.route !== "/signup" ? pending.route : "/dashboard"); }}>Go to Dashboard</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
                {STEP_LABELS.map((l, i) => (
                  <div key={l} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: 4, borderRadius: 99, background: i + 1 <= step ? "var(--green)" : "var(--border)", marginBottom: 6 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: i + 1 === step ? "var(--green-dark)" : "var(--faint)", textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</span>
                  </div>
                ))}
              </div>

              {step === 1 && (
                <>
                  <h2 className="fs-19">Join RUWĀD</h2>
                  <p className="muted fs-13" style={{ margin: "4px 0 18px" }}>Choose how you participate in the ecosystem.</p>
                  <div className="grid-3" style={{ gap: 12 }}>
                    {ACCOUNT_TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="panel"
                        onClick={() => setAccountType(t.id)}
                        style={{
                          gridColumn: "span 1", textAlign: "left", padding: 16, cursor: "pointer",
                          border: `1.5px solid ${accountType === t.id ? "var(--green)" : "rgba(37,99,166,.4)"}`,
                          background: accountType === t.id ? "var(--green-tint)" : "#fff",
                        }}
                      >
                        <div className="prog-icon" style={{ marginBottom: 10 }}><RuwadIcon name={t.icon} size={18} /></div>
                        <b className="fs-13" style={{ display: "block", marginBottom: 3 }}>{t.label}</b>
                        <span className="fs-12" style={{ color: "var(--muted)" }}>{t.desc}</span>
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-lg btn-block mt-24" disabled={!accountType} onClick={() => setStep(2)}>Continue</button>
                </>
              )}

              {step === 2 && (
                <>
                  <h2 className="fs-16">Personal Information</h2>

                  <input ref={resumeInputRef} type="file" accept=".pdf,.docx" style={{ display: "none" }} onChange={(e) => handleResumeFile(e.target.files?.[0])} />
                  <div
                    className={`upload-box${resumeFileName ? " has-file" : ""}`}
                    style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", marginTop: 12 }}
                    onClick={() => resumeInputRef.current?.click()}
                  >
                    <RuwadIcon name="doc" size={20} />
                    <div style={{ flex: 1 }}>
                      <b className="fs-13" role="status">
                        {resumeStage === "uploading" ? "Uploading résumé…"
                          : resumeStage === "extracting" ? "Extracting résumé…"
                          : resumeStage === "analyzing" ? "Filling your information…"
                          : resumeStage === "done" ? "Résumé analyzed successfully."
                          : resumeFileName || "Upload résumé to autofill this form"}
                      </b>
                      <div className="fs-11 muted">{resumeParsing ? "This takes a few seconds" : "PDF or Word (.docx), up to 5MB — optional"}</div>
                    </div>
                  </div>
                  {resumeStage === "done" && (
                    <p className="fs-12 mt-8" role="status">
                      Please review the autofilled information below. {resumeNote}
                    </p>
                  )}
                  {resumeError && <ErrorBanner message={resumeError} onDismiss={() => setResumeError("")} />}

                  <div className="grid-2 mt-16">
                    <div className="field"><label>First Name <span className="req">*</span></label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                    <div className="field"><label>Last Name <span className="req">*</span></label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                    <div className="field"><label>Work Email <span className="req">*</span></label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div className="field">
                      <label>Phone Number <span className="req">*</span></label>
                      <PhoneInput iso2={phoneIso2} onIso2Change={changePhoneIso2} number={phoneNumber} onNumberChange={setPhoneNumber} />
                    </div>
                    <div className="field"><label>Password <span className="req">*</span></label><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" label="password" /></div>
                    <div className="field"><label>Confirm Password <span className="req">*</span></label><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" label="confirm password" /></div>
                    <div className="field"><label>Job Title <span className="req">*</span></label><input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
                    <div className="field"><label>Country <span className="req">*</span></label>
                      <select className="select" value={country} onChange={(e) => changeCountry(e.target.value)}>
                        {ALL_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <label className="fs-12" style={{ display: "flex", gap: 8, margin: "6px 0 20px" }}>
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to RUWĀD Terms of Use and Privacy Policy
                  </label>
                  {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitStep2}>Continue →</button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h2 className="fs-16">Organization</h2>
                  <div className="grid-2 mt-8">
                    {accountType === "founder" ? (
                      <>
                        <div className="field"><label>Startup Name <span className="req">*</span></label><input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></div>
                        <div className="field"><label>Company Website</label><input className="input" value={org.website} onChange={(e) => setOrg({ ...org, website: e.target.value })} /></div>
                        <div className="field"><label>Current Startup Stage <span className="req">*</span></label>
                          <select className="select" value={org.stage} onChange={(e) => setOrg({ ...org, stage: e.target.value })}>
                            {STAGES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="field"><label>Healthcare Category <span className="req">*</span></label>
                          <select className="select" value={org.category} onChange={(e) => setOrg({ ...org, category: e.target.value })}>
                            {HC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="field field-full"><label>City <span className="req">*</span></label><input className="input" value={org.city} onChange={(e) => setOrg({ ...org, city: e.target.value })} /></div>
                      </>
                    ) : accountType === "investor" ? (
                      <>
                        <div className="field"><label>Fund / Organization <span className="req">*</span></label><input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></div>
                        <div className="field"><label>Investor Type <span className="req">*</span></label>
                          <select className="select" value={org.type} onChange={(e) => setOrg({ ...org, type: e.target.value })}>
                            {INVESTOR_TYPES.map((v) => <option key={v}>{v}</option>)}
                          </select>
                        </div>
                        <div className="field"><label>Investment Stage <span className="req">*</span></label>
                          <select className="select" value={org.stage} onChange={(e) => setOrg({ ...org, stage: e.target.value })}>
                            {STAGES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="field"><label>Location <span className="req">*</span></label><input className="input" value={org.city} onChange={(e) => setOrg({ ...org, city: e.target.value })} /></div>
                      </>
                    ) : (
                      <>
                        <div className="field"><label>Organization <span className="req">*</span></label><input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></div>
                        <div className="field"><label>Organization Type <span className="req">*</span></label><input className="input" value={org.type} onChange={(e) => setOrg({ ...org, type: e.target.value })} /></div>
                        <div className="field field-full"><label>Website</label><input className="input" value={org.website} onChange={(e) => setOrg({ ...org, website: e.target.value })} /></div>
                      </>
                    )}
                  </div>
                  {orgError && <ErrorBanner message={orgError} onDismiss={() => setOrgError("")} />}
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button className="btn btn-outline" onClick={() => setStep(2)}>← Back</button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitStep3}>Continue →</button>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <h2 className="fs-16">What are you interested in?</h2>
                  <p className="muted fs-12" style={{ margin: "4px 0 16px" }}>Select as many as apply.</p>
                  <div className="eyebrow mb-8">Healthcare Sectors</div>
                  <div className="chip-select mb-16">
                    {INTEREST_SECTORS.map((s) => (
                      <button key={s} type="button" className={interests.includes(s) ? "active" : ""} onClick={() => toggleInterest(s)}>{s}</button>
                    ))}
                  </div>
                  <div className="eyebrow mb-8">Additional Interests</div>
                  <div className="chip-select mb-16">
                    {INTEREST_EXTRA.map((s) => (
                      <button key={s} type="button" className={interests.includes(s) ? "active" : ""} onClick={() => toggleInterest(s)}>{s}</button>
                    ))}
                  </div>
                  {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button className="btn btn-outline" onClick={() => setStep(3)}>← Back</button>
                    <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting} onClick={completeSignup}>{submitting ? "Creating your workspace…" : "Complete Setup"}</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
