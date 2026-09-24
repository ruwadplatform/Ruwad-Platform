"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { useSession } from "@/hooks/use-store";
import { REPORT_PDF_MAX_BYTES, REPORT_SUBMISSION_GEOGRAPHIES, REPORT_SUBMISSION_SECTORS, REPORT_SUBMISSION_TYPES } from "@/data/reference";
import { submitReport, uploadReportPdf, type SourceLink } from "@/lib/api/report-submissions";

function uuid4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

const isHttpUrl = (s: string) => { try { const u = new URL(s.trim()); return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes("."); } catch { return false; } };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SOURCES = 20;

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="field err" role="alert" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", color: "inherit" }}>
        <RuwadIcon name="x" size={13} />
      </button>
    </div>
  );
}

function Field({ label, required, hint, children, counter }: { label: string; required?: boolean; hint?: string; children: React.ReactNode; counter?: string }) {
  return (
    <div className="field">
      <label>{label} {required && <span className="req">*</span>}</label>
      {children}
      {hint && <div className="fs-11 muted" style={{ marginTop: 4 }}>{hint}</div>}
      {counter && <div className="char-counter">{counter}</div>}
    </div>
  );
}

/** "Publish a report": any signed-in user can ask RUWĀD to publish a report. It stays private (Pending Review) until a
 * reviewer approves it from the emailed link. The form never claims the report is published. */
export function ReportSubmitPage() {
  const { user, loggedIn, hydrated } = useSession();
  const idempotencyKey = useRef(uuid4());

  const [title, setTitle] = useState("");
  const [reportType, setReportType] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [description, setDescription] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [file, setFile] = useState<{ fileId: string; fileName: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sources, setSources] = useState<SourceLink[]>([]);
  const [declaration, setDeclaration] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Fill the author block from the account once, without overwriting anything the user has already typed.
  if (user && !prefilled) {
    setPrefilled(true);
    setAuthorName(`${user.firstName} ${user.lastName}`.trim());
    setAuthorEmail(user.email);
    if (user.org?.name) setOrganizationName(user.org.name);
  }

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to publish a report" body="Anyone with a RUWĀD account can submit a report for publication. Sign in or create a free account and you'll come straight back to this form." />;

  async function onPickFile(f: File | undefined) {
    if (!f) return;
    setError("");
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setError("The report file must be a PDF."); return; }
    if (f.size > REPORT_PDF_MAX_BYTES) { setError("The PDF must be 10 MB or smaller."); return; }
    setUploading(true);
    try { setFile(await uploadReportPdf(f)); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't upload that file. Please try again."); }
    finally { setUploading(false); }
  }

  function validate(): string {
    if (title.trim().length < 5) return "Enter a report title (at least 5 characters).";
    if (!reportType) return "Choose a report type.";
    if (!sector) return "Choose a sector.";
    if (!geography) return "Choose a geography.";
    if (publicationDate.trim() && !/^\d{4}(-\d{2}-\d{2})?$/.test(publicationDate.trim())) return "Publication date must be a year (2026) or a date (2026-03-15).";
    if (description.trim().length < 20) return "Add a short description (at least 20 characters).";
    if (executiveSummary.trim().length < 50) return "Add an executive summary / abstract (at least 50 characters).";
    if (authorName.trim().length < 2) return "Enter the author name.";
    if (organizationName.trim().length < 2) return "Enter the organization.";
    if (!EMAIL_RE.test(authorEmail.trim())) return "Enter a valid work email.";
    if (website.trim() && !isHttpUrl(website)) return "The website must be a full link starting with http:// or https://.";
    if (linkedin.trim() && !isHttpUrl(linkedin)) return "The LinkedIn link must start with http:// or https://.";
    if (reportUrl.trim() && !isHttpUrl(reportUrl)) return "The report link must be a full link starting with http:// or https://.";
    if (!reportUrl.trim() && !file) return "Add a link to the report or upload a PDF.";
    for (const s of sources) {
      if (!s.title.trim() && !s.url.trim()) continue;
      if (s.title.trim().length < 2 || !isHttpUrl(s.url)) return "Each source needs a title and a full link starting with http:// or https://.";
    }
    if (!declaration) return "Please confirm the declaration before submitting.";
    return "";
  }

  async function onSubmit() {
    if (submitting || uploading) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError("");
    setSubmitting(true);
    try {
      await submitReport({
        idempotencyKey: idempotencyKey.current, title: title.trim(), reportType, sector, geography,
        publicationDate: publicationDate.trim() || undefined, description: description.trim(), executiveSummary: executiveSummary.trim(),
        authorName: authorName.trim(), organizationName: organizationName.trim(), authorEmail: authorEmail.trim(),
        website: website.trim() || undefined, linkedin: linkedin.trim() || undefined,
        reportUrl: reportUrl.trim() || undefined, fileId: file?.fileId,
        sources: sources.filter((s) => s.title.trim() && s.url.trim()).map((s) => ({ title: s.title.trim(), url: s.url.trim() })), declaration: true,
      });
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't submit your report. Please try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="content-in" style={{ maxWidth: 640 }}>
        <div className="panel panel-pad" style={{ textAlign: "center", padding: 36 }}>
          <div className="dg-icon" style={{ margin: "0 auto 12px" }}><RuwadIcon name="check" size={22} /></div>
          <h2 className="fs-19" style={{ fontWeight: 700 }}>Your report has been submitted for review.</h2>
          <p className="muted fs-14 mt-8">We&apos;ll notify you by email once it has been reviewed.</p>
          <div className="flex gap-8 mt-20" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-primary" href="/my-reports">View my reports</Link>
            <Link className="btn btn-outline" href="/reports">Back to Reports</Link>
          </div>
        </div>
      </div>
    );
  }

  const busy = submitting || uploading;
  return (
    <div className="content-in" style={{ maxWidth: 820 }}>
      <nav className="fs-12 muted mb-16"><Link href="/reports">Reports</Link> / Publish a report</nav>
      <div className="page-head mb-16">
        <h2>Publish a report</h2>
        <p className="muted small">Submit your report for publication on RUWĀD. A RUWĀD reviewer checks every submission; it stays private and is not shown on the Reports page until it is approved.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

      <section className="panel panel-pad mb-16">
        <h3 className="fs-15 mb-12" style={{ fontWeight: 700 }}>Report information</h3>
        <Field label="Report Title" required><input className="input" maxLength={200} placeholder="Saudi Digital Health Market Report 2026" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid-2">
          <Field label="Report Type" required>
            <select className="select" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="">Select a type…</option>
              {REPORT_SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Sector" required>
            <select className="select" value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Select a sector…</option>
              {REPORT_SUBMISSION_SECTORS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Geography" required>
            <select className="select" value={geography} onChange={(e) => setGeography(e.target.value)}>
              <option value="">Select a geography…</option>
              {REPORT_SUBMISSION_GEOGRAPHIES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Publication Year / Date" hint="A year (2026) or a date (2026-03-15). Optional.">
            <input className="input" inputMode="numeric" maxLength={10} placeholder="2026" value={publicationDate} onChange={(e) => setPublicationDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Short Description" required counter={`${description.length} / 600`}>
          <textarea className="textarea" rows={3} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Executive Summary / Abstract" required counter={`${executiveSummary.length} / 5000`}>
          <textarea className="textarea" rows={7} maxLength={5000} value={executiveSummary} onChange={(e) => setExecutiveSummary(e.target.value)} />
        </Field>
      </section>

      <section className="panel panel-pad mb-16">
        <h3 className="fs-15 mb-12" style={{ fontWeight: 700 }}>Author / organization</h3>
        <div className="grid-2">
          <Field label="Author Name" required><input className="input" maxLength={120} value={authorName} onChange={(e) => setAuthorName(e.target.value)} /></Field>
          <Field label="Organization" required><input className="input" maxLength={160} value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} /></Field>
          <Field label="Work Email" required><input className="input" type="email" maxLength={200} value={authorEmail} onChange={(e) => setAuthorEmail(e.target.value)} /></Field>
          <Field label="Website"><input className="input" maxLength={300} placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} /></Field>
          <Field label="LinkedIn"><input className="input" maxLength={300} placeholder="https://linkedin.com/…" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} /></Field>
        </div>
      </section>

      <section className="panel panel-pad mb-16">
        <h3 className="fs-15 mb-4" style={{ fontWeight: 700 }}>Report source</h3>
        <p className="fs-12 muted mb-12">Add a link to the report, upload a PDF, or both. An uploaded PDF stays private until the report is approved.</p>
        <Field label="Report URL"><input className="input" maxLength={500} placeholder="https://" value={reportUrl} onChange={(e) => setReportUrl(e.target.value)} /></Field>
        <div className="field">
          <label>Upload Report File (PDF, up to 10 MB)</label>
          {file ? (
            <div className="flex gap-8" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span className="fs-13"><RuwadIcon name="doc" size={14} /> {file.fileName} <span className="muted">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFile(null)} disabled={busy}>Remove</button>
            </div>
          ) : (
            <input className="input" type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e) => { void onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
          )}
          {uploading && <div className="fs-12 muted mt-4" role="status">Uploading…</div>}
        </div>
      </section>

      <section className="panel panel-pad mb-16">
        <h3 className="fs-15 mb-4" style={{ fontWeight: 700 }}>Sources / references</h3>
        <p className="fs-12 muted mb-12">If your report is based on external data, list where it comes from. This helps RUWĀD check its credibility.</p>
        {sources.map((s, i) => (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <input className="input" style={{ flex: "1 1 200px", minWidth: 0 }} aria-label={`Source ${i + 1} title`} placeholder="Source title" maxLength={200} value={s.title} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <input className="input" style={{ flex: "2 1 240px", minWidth: 0 }} aria-label={`Source ${i + 1} URL`} placeholder="https://" maxLength={500} value={s.url} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove source ${i + 1}`} onClick={() => setSources(sources.filter((_, j) => j !== i))}><RuwadIcon name="x" size={13} /></button>
          </div>
        ))}
        {sources.length < MAX_SOURCES && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSources([...sources, { title: "", url: "" }])}><RuwadIcon name="plus" size={13} /> Add source</button>
        )}
      </section>

      <section className="panel panel-pad mb-16">
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} style={{ marginTop: 3 }} />
          <span className="fs-13">I confirm that I have the right to submit this report for publication and that the information provided is accurate to the best of my knowledge.</span>
        </label>
      </section>

      <div className="flex gap-8" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-lg" onClick={onSubmit} disabled={busy}>{submitting ? "Submitting…" : "Submit for review"}</button>
        <Link className="btn btn-ghost btn-lg" href="/reports">Cancel</Link>
      </div>
    </div>
  );
}
