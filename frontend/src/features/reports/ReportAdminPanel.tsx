"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { useStartups } from "@/hooks/use-directory-data";
import { HC_CATEGORIES } from "@/data/reference";
import { fetchAdminReports, generateReport, refreshReportResearch, setReportPublished } from "@/lib/api/reports";
import { fetchAdminSubmissions, resendReviewEmail, STATUS_LABEL, type AdminSubmissionRow } from "@/lib/api/report-submissions";
import type { Report } from "@/types/intelligence";

export const REPORT_KIND_OPTIONS = [
  { value: "SECTOR_OVERVIEW", label: "Sector Overview", scope: "sector" },
  { value: "STARTUP_LANDSCAPE", label: "Startup Landscape", scope: "sector" },
  { value: "FUNDING_LANDSCAPE", label: "Funding Landscape", scope: "sector" },
  { value: "INVESTOR_LANDSCAPE", label: "Investor Landscape", scope: "sector" },
  { value: "STARTUP_ANALYSIS", label: "Individual Startup Analysis", scope: "startup" },
] as const;

const STAGES = ["Collecting RUWĀD data…", "Searching external sources…", "Validating sources…", "Building report…"];

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Publish / unpublish / refresh controls for one report. Admin only — the backend enforces this too. */
export function ReportAdminBar({ report, onChanged }: { report: Report; onChanged?: (r: Report) => void }) {
  const { isAdmin } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [busy, setBusy] = useState<string | null>(null);
  const [current, setCurrent] = useState(report);
  if (!isAdmin || !report.dbId) return null;
  const dbId = report.dbId;

  async function run(label: string, fn: () => Promise<Report>, done: string) {
    setBusy(label);
    try {
      const next = await fn();
      setCurrent({ ...current, isPublished: next.isPublished });
      onChanged?.(next);
      toast(done);
      if (label === "refresh") window.location.reload();
    } catch (e) { toast(errText(e)); } finally { setBusy(null); }
  }

  const published = current.isPublished !== false;
  const canRefresh = !!report.generated;
  return (
    <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }} aria-label="Admin actions">
      <button className="btn btn-primary" disabled={!!busy} onClick={() => run("publish", () => setReportPublished(dbId, !published), published ? "Report unpublished" : "Report published")}>
        {busy === "publish" ? "Saving…" : published ? "Unpublish" : "Publish"}
      </button>
      {canRefresh && (
        <button
          className="btn btn-outline"
          disabled={!!busy}
          onClick={() => openModal(
            <ConfirmModal
              title="Refresh external research?"
              body="This runs new web searches (about 5–8) and replaces this report's external sources. RUWĀD statistics are not changed. Your previous sources are kept if the searches fail."
              confirmLabel="Refresh research"
              onCancel={closeModal}
              onConfirm={() => { closeModal(); void run("refresh", () => refreshReportResearch(dbId), "External research refreshed"); }}
            />,
          )}
        >
          {busy === "refresh" ? "Refreshing…" : "Refresh external research"}
        </button>
      )}
    </div>
  );
}

/** Generate reports and manage drafts. Rendered on the Reports page for admins only. */
export function ReportAdminPanel({ onPublishedChange }: { onPublishedChange?: () => void }) {
  const { isAdmin } = useSession();
  const toast = useToast();
  const router = useRouter();
  const { data: startups } = useStartups();
  const [kind, setKind] = useState<string>("SECTOR_OVERVIEW");
  const [sector, setSector] = useState("");
  const [startupSlug, setStartupSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [rows, setRows] = useState<Report[]>([]);
  const [requests, setRequests] = useState<AdminSubmissionRow[]>([]);
  const [resending, setResending] = useState<string | null>(null);
  const [listError, setListError] = useState("");
  const opt = REPORT_KIND_OPTIONS.find((o) => o.value === kind)!;

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    fetchAdminReports().then((r) => { if (live) { setRows(r); setListError(""); } }).catch((e) => { if (live) setListError(errText(e)); });
    fetchAdminSubmissions().then((r) => { if (live) setRequests(r); }).catch(() => { /* the request list is a convenience; the generator above still works */ });
    return () => { live = false; };
  }, [isAdmin, reloadKey]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);
  if (!isAdmin) return null;

  async function generate() {
    if (opt.scope === "startup" && !startupSlug) { toast("Choose a startup first"); return; }
    setStage(0);
    setBusy(true);
    try {
      const r = await generateReport({ kind, ...(opt.scope === "sector" && sector ? { sector } : {}), ...(opt.scope === "startup" ? { startupSlug } : {}) });
      toast("Report generated successfully — saved as a draft");
      router.push(`/reports/${r.id}`);
    } catch (e) { toast(errText(e)); setBusy(false); }
  }

  async function toggle(r: Report) {
    if (!r.dbId) return;
    try { await setReportPublished(r.dbId, r.isPublished === false); toast(r.isPublished === false ? "Report published" : "Report unpublished"); load(); onPublishedChange?.(); }
    catch (e) { toast(errText(e)); }
  }

  async function resend(id: string) {
    setResending(id);
    try { const r = await resendReviewEmail(id); toast(r.sent ? "Review email sent" : "The email could not be sent. Check the email settings and try again."); load(); }
    catch (e) { toast(errText(e)); } finally { setResending(null); }
  }

  const generated = rows.filter((r) => r.reportKind);
  return (
    <section className="panel panel-pad mt-20 mb-24" aria-label="Generate report (admin)">
      <h3 className="fs-15" style={{ fontWeight: 700 }}>Generate a report <span className="badge">Admin</span></h3>
      <p className="fs-12 muted mt-8">Combines RUWĀD platform data with public web sources. Generating runs about 5–8 web searches (saved and reused for 24 hours). The report is saved as a draft until you publish it. Opening a report never runs a search.</p>
      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="fs-12 muted" style={{ display: "grid", gap: 4 }}>Report type *
          <select className="input" aria-label="Report type" value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy} style={{ minWidth: 200, maxWidth: 260 }}>
            {REPORT_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {opt.scope === "sector" ? (
          <label className="fs-12 muted" style={{ display: "grid", gap: 4 }}>Sector
            <select className="input" aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} disabled={busy} style={{ minWidth: 200, maxWidth: 240 }}>
              <option value="">All healthcare sectors</option>
              {HC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ) : (
          <label className="fs-12 muted" style={{ display: "grid", gap: 4 }}>Startup *
            <select className="input" aria-label="Startup" value={startupSlug} onChange={(e) => setStartupSlug(e.target.value)} disabled={busy} style={{ minWidth: 200, maxWidth: 260 }}>
              <option value="">Choose a startup…</option>
              {startups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className="fs-12 muted" style={{ display: "grid", gap: 4 }}>Geography *
          <input className="input" aria-label="Geography" value="Saudi Arabia" readOnly disabled style={{ width: 150 }} title="Reports currently cover Saudi Arabia only" />
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={generate}>{busy ? "Generating…" : "Generate Report"}</button>
      </div>
      {busy && <p className="fs-13 mt-12" role="status" aria-live="polite">{STAGES[stage]}</p>}

      <h4 className="fs-13 mt-20 mb-8" style={{ fontWeight: 700 }}>Generated reports</h4>
      {listError ? <p className="fs-12" style={{ color: "var(--crit)" }}>{listError}</p> : !generated.length ? <p className="fs-12 muted">No generated reports yet.</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {generated.map((r) => (
            <li key={r.id} className="flex gap-8" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <span className="fs-13"><Link href={`/reports/${r.id}`} style={{ fontWeight: 600 }}>{r.title}</Link> <span className={`badge ${r.isPublished === false ? "badge-warn" : "badge-good"}`}>{r.isPublished === false ? "Draft" : "Published"}</span></span>
              <button className="btn btn-outline" onClick={() => toggle(r)}>{r.isPublished === false ? "Publish" : "Unpublish"}</button>
            </li>
          ))}
        </ul>
      )}
      <h4 className="fs-13 mt-20 mb-8" style={{ fontWeight: 700 }}>Community report requests</h4>
      <p className="fs-12 muted mb-8">Reports submitted by users. Reviewers Accept or Reject from the email. Use Resend if the email failed or its link expired.</p>
      {!requests.length ? <p className="fs-12 muted">No requests yet.</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {requests.slice(0, 15).map((s) => (
            <li key={s.id} className="flex gap-8" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <span className="fs-13">{s.title} <span className={`badge ${s.status === "PUBLISHED" ? "badge-good" : s.status === "REJECTED" ? "badge-crit" : "badge-warn"}`}>{STATUS_LABEL[s.status]}</span>
                {s.status === "PENDING_REVIEW" && <span className="fs-12 muted"> · {s.reviewEmailSentAt ? "review email sent" : "review email NOT sent"}</span>}
              </span>
              {s.status === "PENDING_REVIEW" && <button className="btn btn-outline" disabled={resending === s.id} onClick={() => resend(s.id)}>{resending === s.id ? "Sending…" : "Resend review email"}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
