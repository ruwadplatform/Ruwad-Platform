"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { fetchLibraryStatus, generateDefaultLibrary, type LibraryReportOutcome, type LibraryStatusRow } from "@/lib/api/reports";

/** The six default RUWĀD reports, in the order they are listed to the admin. Titles match the backend definitions. */
export const DEFAULT_REPORT_TITLES = [
  "Saudi Healthcare Ecosystem Overview 2026",
  "Saudi Digital Health Landscape 2026",
  "Saudi Biotechnology Landscape 2026",
  "Saudi MedTech Landscape 2026",
  "Saudi Healthcare Startup & Funding Landscape 2026",
  "Saudi Healthcare Infrastructure & Workforce 2026",
];

/** Steps shown while the server works. The server runs them inside one request, so they advance on a timer and the last one
 * stays until the request finishes; completion is only ever announced from the server's response. */
export const GENERATION_STEPS = [
  "Collecting RUWĀD statistics…",
  "Checking official sources…",
  "Retrieving World Bank indicators…",
  "Searching additional sources…",
  "Validating facts…",
  "Building reports…",
  "Saving reports…",
];
const STEP_MS = 7000;

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const OUTCOME_LABEL: Record<LibraryReportOutcome["action"], string> = { created: "Created", updated: "Updated", preview: "Checked", skipped: "Not saved", failed: "Failed" };

function ConfirmGenerate({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Generate Default RUWĀD Reports</h3>
      <p className="muted small mt-8">This will generate or update the default RUWĀD report library using current RUWĀD database statistics and verified external sources.</p>
      <ul className="small mt-12" style={{ paddingLeft: 18, display: "grid", gap: 4, margin: "12px 0 0" }}>
        {DEFAULT_REPORT_TITLES.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="muted fs-12 mt-12">Reports that pass every check are published right away. Existing default reports are updated, never duplicated. Any report that cannot be fully verified is not saved or published. Opening or searching reports never runs a web search.</p>
      <div className="flex gap-8 mt-16">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={onConfirm}>Generate Reports</button>
      </div>
    </div>
  );
}

/** Admin control for the default RUWĀD report library. Rendered inside the Reports admin panel, which only admins ever see. */
export function DefaultReportsAdmin({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [status, setStatus] = useState<LibraryStatusRow[] | null>(null);
  const [statusError, setStatusError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState<LibraryReportOutcome[] | null>(null);
  const [runError, setRunError] = useState("");

  const loadStatus = useCallback(() => {
    fetchLibraryStatus().then((r) => { setStatus(r); setStatusError(""); }).catch((e) => setStatusError(errText(e)));
  }, []);
  useEffect(loadStatus, [loadStatus]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, GENERATION_STEPS.length - 1)), STEP_MS);
    return () => clearInterval(t);
  }, [busy]);

  const total = status?.length ?? DEFAULT_REPORT_TITLES.length;
  const available = status?.filter((s) => s.exists && s.isPublished).length ?? 0;
  const saved = status?.filter((s) => s.exists).length ?? 0;
  const update = saved > 0;

  async function run() {
    if (busy) return; // a second click while a run is in progress does nothing
    closeModal();
    setBusy(true); setStep(0); setOutcome(null); setRunError("");
    try {
      const res = await generateDefaultLibrary();
      setOutcome(res.reports);
      const ok = res.reports.filter((r) => r.action === "created" || r.action === "updated").length;
      const bad = res.reports.length - ok;
      toast(bad === 0 ? "Reports generated successfully." : `${ok} of ${res.reports.length} reports saved. ${bad} could not be fully verified and ${bad === 1 ? "was" : "were"} not saved.`);
      loadStatus();
      if (ok > 0) onChanged?.();
    } catch (e) {
      const msg = errText(e);
      setRunError(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  const confirm = () => openModal(<ConfirmGenerate onCancel={closeModal} onConfirm={() => { void run(); }} />);

  return (
    <div className="mb-24" aria-label="Default RUWĀD reports (admin)">
      <h3 className="fs-15" style={{ fontWeight: 700 }}>Default RUWĀD reports <span className="badge">Admin</span></h3>
      <p className="fs-12 muted mt-8">The six original RUWĀD reports, built from current RUWĀD statistics and verified public sources. Generating spends web searches only when new ones are needed (results are reused for 24 hours).</p>
      <div className="flex gap-8 mt-12" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" disabled={busy || (status === null && !statusError)} onClick={confirm}>
          {busy ? "Generating…" : update ? "Update Default Reports" : "Generate Default Reports"}
        </button>
        {status && <span className="fs-13" aria-live="polite"><span className={`badge ${available === total ? "badge-good" : "badge-warn"}`}>{available} / {total} Default Reports Available</span>{saved > available ? <span className="fs-12 muted"> · {saved - available} unpublished</span> : null}</span>}
        {statusError && <span className="fs-12" style={{ color: "var(--crit)" }}>Couldn&apos;t check the library status: {statusError}</span>}
      </div>

      {busy && (
        <div className="mt-12" role="status" aria-live="polite">
          <p className="fs-13" style={{ fontWeight: 600 }}>{GENERATION_STEPS[step]}</p>
          <ol className="fs-12 muted" style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 2 }}>
            {GENERATION_STEPS.map((s, i) => <li key={s} style={{ opacity: i <= step ? 1 : 0.45 }}>{i < step ? "✓" : i === step ? "…" : "·"} {s.replace("…", "")}</li>)}
          </ol>
          <p className="fs-12 muted mt-8">This can take a minute. You can keep using the page.</p>
        </div>
      )}

      {!busy && runError && <p className="fs-13 mt-12" role="alert" style={{ color: "var(--crit)" }}>Generation failed: {runError}. Nothing was published.</p>}

      {!busy && outcome && (
        <div className="mt-12" role="status">
          <p className="fs-13" style={{ fontWeight: 600 }}>{outcome.every((o) => o.action === "created" || o.action === "updated") ? "Reports generated successfully." : "Generation finished with issues."}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 }}>
            {outcome.map((o) => (
              <li key={o.slug} className="fs-13">
                <span className={`badge ${o.action === "created" || o.action === "updated" ? "badge-good" : "badge-warn"}`}>{OUTCOME_LABEL[o.action]}</span>{" "}
                {o.action === "created" || o.action === "updated" ? <Link href={`/reports/${o.slug}`}>{o.title}</Link> : o.title}
                {o.reasons.length > 0 && <span className="fs-12 muted"> — {o.reasons.join("; ")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
