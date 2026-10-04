"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { BarChart } from "@/components/intelligence/BarChart";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import {
  fetchHistoricalBatches, fetchHistoricalDashboard, uploadHistoricalBatch, commitHistoricalBatch, downloadHistoricalTemplate,
  type HistoricalImportBatch, type HistoricalDashboardMetrics, type HistoricalEvidenceSourceType,
} from "@/lib/api/ml-data";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

const SOURCE_TYPES: { value: HistoricalEvidenceSourceType; label: string }[] = [
  { value: "PUBLIC_COMPANY_SOURCE", label: "Public Company Source" },
  { value: "PUBLIC_REGULATORY_SOURCE", label: "Public Regulatory Source" },
  { value: "PUBLIC_NEWS_SOURCE", label: "Public News Source" },
  { value: "LICENSED_DATABASE", label: "Licensed Database" },
  { value: "RESEARCH_DATABASE", label: "Research Database" },
  { value: "PATENT_DATABASE", label: "Patent Database" },
  { value: "CLINICAL_TRIAL_REGISTRY", label: "Clinical Trial Registry" },
  { value: "VERIFIED_DOCUMENT", label: "Verified Document" },
  { value: "ADMIN_ENTERED", label: "Admin Entered" },
  { value: "FOUNDER_REPORTED", label: "Founder Reported" },
];

const BATCH_STATUS_BADGE: Record<string, string> = {
  UPLOADED: "badge-neutral", VALIDATING: "badge-info", DRY_RUN_COMPLETE: "badge-info", IMPORTING: "badge-info",
  COMPLETED: "badge-good", PARTIAL: "badge-warn", FAILED: "badge-crit",
};

export function AdminHistoricalDataPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [batches, setBatches] = useState<HistoricalImportBatch[] | null>(null);
  const [metrics, setMetrics] = useState<HistoricalDashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<HistoricalEvidenceSourceType>("PUBLIC_COMPANY_SOURCE");
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const load = useCallback(() => {
    if (!isAdmin) return;
    Promise.all([fetchHistoricalBatches(), fetchHistoricalDashboard()])
      .then(([b, m]) => { setBatches(b); setMetrics(m); })
      .catch((e) => setError(errText(e)));
  }, [isAdmin]);
  useEffect(load, [load]);

  async function handleFile(file: File | undefined, dryRun: boolean) {
    if (!file || !sourceName.trim()) { toast("Enter a source name first."); return; }
    setUploading(true);
    setUploadProgress(0);
    try {
      const batch = await uploadHistoricalBatch(file, { sourceName: sourceName.trim(), sourceType, dryRun }, { onUploadProgress: setUploadProgress });
      toast(dryRun
        ? `Dry run complete — ${batch.rowsAccepted} would import, ${batch.rowsNeedsReview} need review, ${batch.rowsRejected} invalid`
        : `Import ${batch.status.toLowerCase()} — ${batch.rowsAccepted} imported, ${batch.rowsNeedsReview} need review`);
      load();
    } catch (e) { toast(errText(e)); } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function commit(batch: HistoricalImportBatch) {
    setBusyId(batch.id);
    try { await commitHistoricalBatch(batch.id); toast("Batch committed for real."); load(); }
    catch (e) { toast(errText(e)); } finally { setBusyId(null); }
  }

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to import historical data." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load historical data" body={error} /></div>;

  return (
    <div>
      <IntelligencePageHeader
        title="Historical Data"
        description="Import sourced, dated evidence about existing companies to reconstruct real historical feature snapshots and outcome events — never synthetic data, never bypassing the readiness gate."
      />

      <div className="toolbar mt-16">
        <Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical/matches">Match Review</Link>
        <Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical/conflicts">Evidence Conflicts</Link>
        <Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical/cohorts">Cohorts</Link>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Import a CSV</h3>
        <div className="flex gap-8 mb-12" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <span className="small muted">Download a template first:</span>
          <button className="btn btn-outline btn-sm" onClick={() => downloadHistoricalTemplate("features")}>Features CSV</button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadHistoricalTemplate("outcomes")}>Outcome Events CSV</button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadHistoricalTemplate("identities")}>Company Identities CSV</button>
        </div>
        <div className="grid-2 mb-12">
          <div className="field">
            <label>Source Name</label>
            <input className="input" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. MAGNiTT Healthcare Export" />
          </div>
          <div className="field">
            <label>Source Type</label>
            <select className="select" value={sourceType} onChange={(e) => setSourceType(e.target.value as HistoricalEvidenceSourceType)}>
              {SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div
          className={`ai-upload-panel-lg${drag ? " drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handleFile(e.dataTransfer.files?.[0], true); }}
          onClick={() => fileInput.current?.click()}
          style={{ cursor: "pointer" }}
        >
          <input ref={fileInput} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => void handleFile(e.target.files?.[0], true)} />
          <p className="small">{uploading ? `Uploading… ${Math.round(uploadProgress * 100)}%` : "Drop a .csv file here, or click to choose one. This always runs as a dry run first — nothing is written yet."}</p>
        </div>
      </div>

      {metrics && (
        <div className="panel panel-pad mt-16">
          <h3 className="fs-13 mb-12">Historical Data Quality</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Companies Matched</div><div className="sm-val fs-15">{metrics.companiesMatched}</div></div>
            <div className="stat-mini"><div className="sm-label">Unmatched</div><div className="sm-val fs-15">{metrics.companiesUnmatched}</div></div>
            <div className="stat-mini"><div className="sm-label">Needs Review</div><div className="sm-val fs-15">{metrics.companiesReviewRequired}</div></div>
            <div className="stat-mini"><div className="sm-label">Snapshots Created</div><div className="sm-val fs-15">{metrics.snapshotsCreated}</div></div>
            <div className="stat-mini"><div className="sm-label">≥60% Core Coverage</div><div className="sm-val fs-15">{metrics.snapshotsWithCoreCoverage}</div></div>
            <div className="stat-mini"><div className="sm-label">Evidence Conflicts</div><div className="sm-val fs-15">{metrics.evidenceConflicts}</div></div>
            <div className="stat-mini"><div className="sm-label">Verified Evidence</div><div className="sm-val fs-15">{Math.round(metrics.verifiedEvidencePct * 100)}%</div></div>
          </div>
          <div className="grid-2 mt-16">
            <div>
              <h4 className="fs-12 muted mb-8">Mature Labels by Window</h4>
              <BarChart data={Object.entries(metrics.matureLabelsByWindow).map(([w, v]) => ({ l: `${w}mo`, v }))} />
            </div>
            <div>
              <h4 className="fs-12 muted mb-8">Evidence by Source Type</h4>
              <BarChart data={metrics.perSourceTypeCounts.map((s) => ({ l: s.sourceType, v: s.rows }))} />
            </div>
          </div>
        </div>
      )}

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Import Batches</h3>
        {batches === null ? (
          <p className="small muted">Loading…</p>
        ) : batches.length === 0 ? (
          <p className="small muted">No batches imported yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Source</th><th>File</th><th>Status</th><th>Rows</th><th>Accepted</th><th>Needs Review</th><th>Rejected</th><th>Imported</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="small">{b.sourceName}{b.dryRun && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>DRY RUN</span>}</td>
                    <td className="small">{b.fileName}</td>
                    <td><span className={`badge ${BATCH_STATUS_BADGE[b.status] ?? "badge-neutral"}`}>{b.status.replace(/_/g, " ")}</span></td>
                    <td className="small">{b.rowsTotal}</td>
                    <td className="small">{b.rowsAccepted}</td>
                    <td className="small">{b.rowsNeedsReview}</td>
                    <td className="small">{b.rowsRejected}</td>
                    <td className="small">{new Date(b.importedAt).toLocaleString()}</td>
                    <td>
                      {b.status === "DRY_RUN_COMPLETE" && (
                        <button className="btn btn-primary btn-sm" disabled={busyId === b.id} onClick={() => commit(b)}>{busyId === b.id ? "…" : "Commit for Real"}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
