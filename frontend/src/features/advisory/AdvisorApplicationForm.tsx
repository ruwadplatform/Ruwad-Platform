"use client";

import { useId, useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { submitAdvisorApplication } from "@/lib/api/advisory";
import { formatBytes } from "@/lib/api/data-room-files";
import {
  DECLARATION_TEXT, DURATIONS, EMPTY_APPLICATION, FIELD_ORDER, MAX_CERTIFICATES, validateApplication, toPayload,
  type ApplicationFiles, type ApplicationValues, type FieldErrors, type FieldKey,
} from "./application-form";
import { errText } from "./booking-format";

const DRAFT_KEY = "ruwad.advisorApplicationDraft.v1";

/** Only the typed text is remembered (never files, never the declaration), so closing the window by accident doesn't throw away a long biography.
 * Browser storage can be unavailable or full: every access is guarded and the form works the same without it. */
function loadDraft(): Partial<ApplicationValues> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...JSON.parse(raw), declaration: false } : {};
  } catch { return {}; }
}
const saveDraft = (v: ApplicationValues) => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...v, declaration: false })); } catch { /* unavailable: fine */ } };
const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* unavailable: fine */ } };

export interface SubmittedApplication { reference: string; submittedAt: string }

function Field({ id, label, required, hint, error, children }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className={`adv-bfield${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}{required ? <span className="adv-req" aria-hidden="true"> *</span> : <span className="muted"> (optional)</span>}{hint && <span className="muted adv-hint"> {hint}</span>}</label>
      {children}
      {error && <p className="adv-field-error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

function FilePick({ id, label, required, hint, accept, multiple, files, onAdd, onRemove, error }: {
  id: string; label: string; required?: boolean; hint: string; accept: string; multiple?: boolean; files: File[]; onAdd: (f: File[]) => void; onRemove: (i: number) => void; error?: string;
}) {
  return (
    <div className={`adv-bfield${error ? " has-error" : ""}`}>
      <span className="adv-filelabel" id={`${id}-lbl`}>{label}{required ? <span className="adv-req" aria-hidden="true"> *</span> : <span className="muted"> (optional)</span>}</span>
      <p className="adv-hint-line">{hint}</p>
      <div className="adv-file">
        <input id={id} className="adv-file-native" type="file" accept={accept} multiple={multiple} aria-labelledby={`${id}-lbl`} aria-describedby={error ? `${id}-err` : undefined} aria-invalid={error ? true : undefined}
          onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; if (picked.length) onAdd(picked); }} />
        <label htmlFor={id} className="btn btn-outline btn-sm"><RuwadIcon name="upload" size={14} /> {files.length && !multiple ? "Replace file" : multiple ? "Add files" : "Choose file"}</label>
      </div>
      {files.length > 0 && (
        <ul className="adv-filelist">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="adv-filename">{f.name}</span><span className="muted adv-filesize">{formatBytes(f.size)}</span>
              <button type="button" className="adv-file-remove" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="adv-field-error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

/** The "Become an Advisor" application. Validates as you go (on leaving a field, and everything on submit), keeps the typed text as a draft, and
 * can only be sent once: the button is disabled while sending and a second click while a request is in flight is ignored. The server re-checks
 * everything, including what is really inside each file. */
export function AdvisorApplicationForm({ prefill, onSubmitted }: { prefill?: Partial<ApplicationValues>; onSubmitted: (r: SubmittedApplication) => void }) {
  const uid = useId().replace(/:/g, "");
  const idOf = (k: FieldKey) => `adv-app-${uid}-${k}`;
  const [v, setV] = useState<ApplicationValues>(() => ({ ...EMPTY_APPLICATION, ...prefill, ...loadDraft() }));
  const [cv, setCv] = useState<File | null>(null);
  const [certs, setCerts] = useState<File[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const sending = useRef(false);

  const filesOf = (c = cv, ce = certs, p = photo): ApplicationFiles => ({ cv: c, certificates: ce, photo: p });
  const recheck = (next: ApplicationValues, f: ApplicationFiles, show: Partial<Record<FieldKey, boolean>> = touched) => {
    const all = validateApplication(next, f);
    setErrors(Object.fromEntries(Object.entries(all).filter(([k]) => show[k as FieldKey])) as FieldErrors);
  };
  const set = <K extends keyof ApplicationValues>(k: K, value: ApplicationValues[K]) => {
    const next = { ...v, [k]: value };
    setV(next);
    saveDraft(next);
    recheck(next, filesOf());
  };
  const blur = (k: FieldKey) => { const show = { ...touched, [k]: true }; setTouched(show); recheck(v, filesOf(), show); };
  const text = (k: keyof ApplicationValues) => ({
    id: idOf(k), value: v[k] as string, "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `${idOf(k)}-err` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
    onBlur: () => blur(k),
  });
  const fileChange = (nextCv: File | null, nextCerts: File[], nextPhoto: File | null, key: FieldKey) => {
    setCv(nextCv); setCerts(nextCerts); setPhoto(nextPhoto);
    const show = { ...touched, [key]: true };
    setTouched(show);
    recheck(v, filesOf(nextCv, nextCerts, nextPhoto), show);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current) return; // a double click or a second Enter must not send twice
    setFormError("");
    const all = validateApplication(v, filesOf());
    setTouched(Object.fromEntries(FIELD_ORDER.map((k) => [k, true])));
    setErrors(all);
    const first = FIELD_ORDER.find((k) => all[k]);
    if (first || !cv) {
      const el = document.getElementById(idOf(first ?? "cv"));
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const res = await submitAdvisorApplication(toPayload(v), { cv, certificates: certs, photo });
      clearDraft();
      onSubmitted(res);
    } catch (err) {
      setFormError(errText(err));
      setBusy(false);
      sending.current = false;
    }
  }

  const problems = FIELD_ORDER.filter((k) => errors[k]);

  return (
    <form className="adv-form adv-apply" onSubmit={submit} noValidate>
      {problems.length > 1 && touched.declaration && (
        <div className="adv-review-note adv-review-error" role="alert"><RuwadIcon name="info" size={14} /> Please fix the {problems.length} highlighted fields below, then submit again.</div>
      )}

      <fieldset className="adv-fieldset">
        <legend>Personal information</legend>
        <div className="adv-grid2">
          <Field id={idOf("name")} label="Full name" required error={errors.name}><input className="input" autoComplete="name" maxLength={120} {...text("name")} /></Field>
          <Field id={idOf("email")} label="Email address" required error={errors.email}><input className="input" type="email" autoComplete="email" maxLength={254} {...text("email")} /></Field>
          <Field id={idOf("phone")} label="Phone number" required error={errors.phone}><input className="input" type="tel" autoComplete="tel" inputMode="tel" maxLength={25} placeholder="+966 5X XXX XXXX" {...text("phone")} /></Field>
          <Field id={idOf("designation")} label="Professional designation" required error={errors.designation}><input className="input" maxLength={120} placeholder="e.g. Professor of Cardiology" {...text("designation")} /></Field>
          <Field id={idOf("institution")} label="Current institution or organization" required error={errors.institution}><input className="input" autoComplete="organization" maxLength={160} {...text("institution")} /></Field>
          <Field id={idOf("location")} label="City and country" required error={errors.location}><input className="input" maxLength={120} placeholder="e.g. Riyadh, Saudi Arabia" {...text("location")} /></Field>
        </div>
      </fieldset>

      <fieldset className="adv-fieldset">
        <legend>Professional expertise</legend>
        <div className="adv-grid2">
          <Field id={idOf("specialization")} label="Primary specialization" required error={errors.specialization}><input className="input" maxLength={120} {...text("specialization")} /></Field>
          <Field id={idOf("yearsExperience")} label="Years of professional experience" required error={errors.yearsExperience}><input className="input" inputMode="numeric" maxLength={2} {...text("yearsExperience")} /></Field>
        </div>
        <Field id={idOf("specializations")} label="Additional specializations" hint="separate with commas" error={errors.specializations}><input className="input" {...text("specializations")} /></Field>
        <Field id={idOf("about")} label="Professional biography" required error={errors.about} hint="a few sentences on your background and experience">
          <textarea className="textarea" rows={5} maxLength={3000} {...text("about")} />
          <div className="char-counter">{v.about.length}/3000</div>
        </Field>
        <Field id={idOf("researchAreas")} label="Research interests" hint="separate with commas" error={errors.researchAreas}><input className="input" {...text("researchAreas")} /></Field>
        <Field id={idOf("consultationServices")} label="Consultation services offered" hint="what founders can ask you for" error={errors.consultationServices}>
          <textarea className="textarea" rows={3} maxLength={1500} {...text("consultationServices")} />
        </Field>
        <div className="adv-grid2">
          <Field id={idOf("preferredMinutes")} label="Preferred consultation duration" error={errors.preferredMinutes}>
            <select className="select" {...text("preferredMinutes")}>
              <option value="">No preference</option>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </Field>
          <span />
          <Field id={idOf("linkedinUrl")} label="LinkedIn profile" error={errors.linkedinUrl}><input className="input" type="url" inputMode="url" maxLength={300} placeholder="https://www.linkedin.com/in/…" {...text("linkedinUrl")} /></Field>
          <Field id={idOf("websiteUrl")} label="Google Scholar or professional website" error={errors.websiteUrl}><input className="input" type="url" inputMode="url" maxLength={300} placeholder="https://" {...text("websiteUrl")} /></Field>
        </div>
      </fieldset>

      <fieldset className="adv-fieldset">
        <legend>Supporting documents</legend>
        <p className="adv-hint-line adv-docs-note"><RuwadIcon name="lock" size={13} /> Your documents are private. They are visible only to RUWĀD administrators reviewing your application, and are never shown on your public profile.</p>
        <FilePick id={idOf("cv")} label="CV or resume" required hint="PDF, up to 5 MB" accept=".pdf,application/pdf" files={cv ? [cv] : []} error={errors.cv}
          onAdd={(f) => fileChange(f[0]!, certs, photo, "cv")} onRemove={() => fileChange(null, certs, photo, "cv")} />
        <FilePick id={idOf("certificates")} label="Professional certificates" multiple hint={`PDF, PNG or JPG, up to 5 MB each, at most ${MAX_CERTIFICATES}`} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" files={certs} error={errors.certificates}
          onAdd={(f) => fileChange(cv, [...certs, ...f], photo, "certificates")} onRemove={(i) => fileChange(cv, certs.filter((_, j) => j !== i), photo, "certificates")} />
        <FilePick id={idOf("photo")} label="Profile photograph" hint="PNG or JPG, up to 2 MB" accept=".png,.jpg,.jpeg,image/png,image/jpeg" files={photo ? [photo] : []} error={errors.photo}
          onAdd={(f) => fileChange(cv, certs, f[0]!, "photo")} onRemove={() => fileChange(cv, certs, null, "photo")} />
      </fieldset>

      <fieldset className="adv-fieldset">
        <legend>Declaration</legend>
        <div className={`adv-check${errors.declaration ? " has-error" : ""}`}>
          <input id={idOf("declaration")} type="checkbox" checked={v.declaration} aria-invalid={errors.declaration ? true : undefined} aria-describedby={errors.declaration ? `${idOf("declaration")}-err` : undefined}
            onChange={(e) => set("declaration", e.target.checked)} onBlur={() => blur("declaration")} />
          <label htmlFor={idOf("declaration")}>{DECLARATION_TEXT} <span className="adv-req" aria-hidden="true">*</span></label>
        </div>
        {errors.declaration && <p className="adv-field-error" id={`${idOf("declaration")}-err`} role="alert">{errors.declaration}</p>}
      </fieldset>

      {formError && <p className="adv-review-note adv-review-error" role="alert"><RuwadIcon name="info" size={14} /> {formError}</p>}
      <div className="adv-apply-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Submitting…" : "Submit Application"}</button>
        <p className="adv-hint-line">Fields marked <span className="adv-req">*</span> are required. Nothing is published until RUWĀD has reviewed your application.</p>
      </div>
    </form>
  );
}
