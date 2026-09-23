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
  const [listError, setListError] = useState("");
  const opt = REPORT_KIND_OPTIONS.find((o) => o.value === kind)!;

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    fetchAdminReports().then((r) => { if (live) { setRows(r); setListError(""); } }).catch((e) => { if (live) setListError(errText(e)); });
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
    </section>
  );
}
