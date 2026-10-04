"use client";

import { useCallback, useEffect, useState } from "react";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { BarChart } from "@/components/intelligence/BarChart";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import {
  fetchMlTargets, fetchMlCoverage, fetchMlFeatureCoverage, fetchMlQualityIssues, fetchMlClassBalanceAll, fetchMlReadiness,
  runMlSnapshotBackfill, downloadMlDatasetExport,
  type TargetMeta, type StartupCoverageReport, type FeatureCoverageStat, type DataQualityIssue, type ClassBalanceReport, type ReadinessReport,
} from "@/lib/api/ml-data";
import { ApiError } from "@/lib/api/client";
import { ReadinessV2Panel } from "./ReadinessV2Panel";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

export function AdminMlDataPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();

  const [targets, setTargets] = useState<TargetMeta[] | null>(null);
  const [coverage, setCoverage] = useState<StartupCoverageReport | null>(null);
  const [featureCoverage, setFeatureCoverage] = useState<FeatureCoverageStat[] | null>(null);
  const [issues, setIssues] = useState<DataQualityIssue[] | null>(null);
  const [classBalance, setClassBalance] = useState<ClassBalanceReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedTarget, setSelectedTarget] = useState("");
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);

  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [minConfidence, setMinConfidence] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [includeIdentifiers, setIncludeIdentifiers] = useState(true);
  const [includeImmature, setIncludeImmature] = useState(false);
  const [includeAnalysisOnly, setIncludeAnalysisOnly] = useState(false);

  const load = useCallback(() => {
    if (!isAdmin) return;
    Promise.all([fetchMlTargets(), fetchMlCoverage(), fetchMlFeatureCoverage(), fetchMlQualityIssues(), fetchMlClassBalanceAll()])
      .then(([t, c, fc, iss, cb]) => {
        setTargets(t); setCoverage(c); setFeatureCoverage(fc); setIssues(iss); setClassBalance(cb);
        if (!selectedTarget && t.length) setSelectedTarget(t[0].name);
      })
      .catch((e) => setError(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!selectedTarget || !isAdmin) return;
    fetchMlReadiness(selectedTarget).then(setReadiness).catch(() => setReadiness(null));
  }, [selectedTarget, isAdmin]);

  async function backfill() {
    setBusy(true);
    try {
      const rows = await runMlSnapshotBackfill();
      const created = rows.filter((r) => r.created).length;
      toast(`Backfill complete — ${created} new snapshot(s) of ${rows.length} startup(s)`);
      load();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  async function doExport() {
    if (!selectedTarget) return;
    setBusy(true);
    try {
      await downloadMlDatasetExport({
        target: selectedTarget, format: exportFormat,
        minConfidence: minConfidence ? Number(minConfidence) : undefined,
        verifiedOnly, includeIdentifiers, includeImmature, includeAnalysisOnly,
      });
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to view ML dataset readiness." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load ML dataset data" body={error} /></div>;
  if (!targets || !coverage || !featureCoverage || !issues || !classBalance) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;

  const selectedBalance = classBalance.find((c) => c.target === selectedTarget);
  const selectedMeta = targets.find((t) => t.name === selectedTarget);

  return (
    <div>
      <IntelligencePageHeader
        title="ML Dataset Readiness"
        description="Internal tooling for judging whether the training data is ready — never used to train a model itself."
        action={<button className="btn btn-outline btn-sm" disabled={busy} onClick={backfill}>Run Snapshot Backfill</button>}
      />

      <ReadinessV2Panel />

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Dataset Overview</h3>
        <div className="stat-mini-row">
          <div className="stat-mini"><div className="sm-label">Published Startups</div><div className="sm-val fs-15">{coverage.totalPublishedStartups}</div></div>
          <div className="stat-mini"><div className="sm-label">4+ Scoring Factors</div><div className="sm-val fs-15">{coverage.with4PlusFactors}</div></div>
          <div className="stat-mini"><div className="sm-label">50%+ Confidence</div><div className="sm-val fs-15">{coverage.with50PlusConfidence}</div></div>
          <div className="stat-mini"><div className="sm-label">70%+ Confidence</div><div className="sm-val fs-15">{coverage.with70PlusConfidence}</div></div>
          <div className="stat-mini"><div className="sm-label">12mo+ Old Snapshots</div><div className="sm-val fs-15">{coverage.withComplete12MonthHistory}</div></div>
          <div className="stat-mini"><div className="sm-label">Mature 12mo Funding Labels</div><div className="sm-val fs-15">{coverage.withMature12MonthLabels}</div></div>
        </div>
        <div className="grid-2 mt-16">
          <div><h4 className="fs-12 muted mb-8">By Category</h4><BarChart data={coverage.byCategory} /></div>
          <div><h4 className="fs-12 muted mb-8">By Stage</h4><BarChart data={coverage.byStage} /></div>
        </div>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Feature Coverage</h3>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Feature</th><th>Coverage</th><th>Verified</th><th>Unique</th><th>Range / Distribution</th></tr></thead>
            <tbody>
              {featureCoverage.filter((f) => f.nonNullCount > 0).sort((a, b) => a.missingPct - b.missingPct).map((f) => (
                <tr key={f.key}>
                  <td className="small">{f.key}</td>
                  <td className="small">{(100 - f.missingPct).toFixed(1)}%</td>
                  <td className="small">{f.verifiedPct.toFixed(1)}%</td>
                  <td className="small">{f.uniqueCount}</td>
                  <td className="small">{f.isCategorical ? (f.categoryDistribution ?? []).slice(0, 3).map((d) => `${d.value} (${d.count})`).join(", ") : `${f.min ?? "—"} – ${f.max ?? "—"} (mean ${f.mean ?? "—"})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Target Coverage &amp; Class Balance</h3>
        <p className="small muted mb-8">Readiness V2 counts: training-eligible snapshots only. A negative needs attested outcome coverage; otherwise the row is Unknown.</p>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Target</th><th>Window</th><th>Positive</th><th>Negative</th><th>Unknown</th><th>Not Matured</th><th>Insufficient</th></tr></thead>
            <tbody>
              {classBalance.map((c) => (
                <tr key={c.target} className={c.target === selectedTarget ? "active" : ""} onClick={() => setSelectedTarget(c.target)} style={{ cursor: "pointer" }}>
                  <td className="small">{c.target}</td>
                  <td className="small">{c.windowMonths}mo</td>
                  <td className="small">{c.positive}</td>
                  <td className="small">{c.negative}</td>
                  <td className="small">{c.unknown ?? 0}</td>
                  <td className="small">{c.notMatured}</td>
                  <td className="small">{c.insufficientData}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {readiness && selectedBalance && (
        <div className="panel panel-pad mt-16">
          <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="fs-13">Readiness{readiness.readinessVersion ? ` V${readiness.readinessVersion}` : ""} — {readiness.target}</h3>
            <span className={`badge ${readiness.ready ? "badge-good" : "badge-warn"}`}>{readiness.ready ? "Ready" : "Not Ready"}</span>
          </div>
          <div className="stat-mini-row mt-12">
            <div className="stat-mini"><div className="sm-label">Usable Examples</div><div className="sm-val fs-15">{readiness.usableExamples}</div></div>
            <div className="stat-mini"><div className="sm-label">Positive</div><div className="sm-val fs-15">{readiness.positiveExamples}</div></div>
            <div className="stat-mini"><div className="sm-label">Negative</div><div className="sm-val fs-15">{readiness.negativeExamples}</div></div>
            <div className="stat-mini"><div className="sm-label">Core Feature Coverage</div><div className="sm-val fs-15">{Math.round(readiness.featureCoverage * 100)}%</div></div>
          </div>
          {readiness.reasons.length > 0 && (
            <ul className="small mt-12" style={{ paddingLeft: 18 }}>
              {readiness.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Data Quality Issues {issues.length > 0 && <span className="badge badge-warn">{issues.length}</span>}</h3>
        {issues.length === 0 ? (
          <p className="small muted">No structural data-quality issues detected.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Kind</th><th>Startup</th><th>Detail</th></tr></thead>
              <tbody>
                {issues.map((i, idx) => (
                  <tr key={idx}><td className="small">{i.kind}</td><td className="small">{i.startupId.slice(0, 8)}</td><td className="small">{i.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Export Dataset</h3>
        <p className="small muted mb-12">Admin-only. Excludes RUWĀD Score and any PII by construction. By default only training-eligible snapshots with defensible labels are exported: immature rows and analysis-only snapshots (such as outcome-aware legacy ones) are excluded unless explicitly included below.</p>
        <div className="grid-2">
          <div className="field">
            <label>Target</label>
            <select className="select" value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}>
              {targets.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.windowMonths}mo)</option>)}
            </select>
          </div>
          <div className="field">
            <label>Format</label>
            <select className="select" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as "csv" | "json")}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div className="field">
            <label>Minimum Confidence</label>
            <input className="input" type="number" min={0} max={1} step={0.1} value={minConfidence} onChange={(e) => setMinConfidence(e.target.value)} placeholder="e.g. 0.5" />
          </div>
          <div className="field">
            <label>Verified Features Only</label>
            <button type="button" className={`toggle${verifiedOnly ? " on" : ""}`} aria-pressed={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)} />
          </div>
          <div className="field">
            <label>Include Identifiers</label>
            <button type="button" className={`toggle${includeIdentifiers ? " on" : ""}`} aria-pressed={includeIdentifiers} onClick={() => setIncludeIdentifiers((v) => !v)} />
          </div>
          <div className="field">
            <label>Include Immature/Insufficient Rows (audit only)</label>
            <button type="button" className={`toggle${includeImmature ? " on" : ""}`} aria-pressed={includeImmature} onClick={() => setIncludeImmature((v) => !v)} />
          </div>
          <div className="field">
            <label>Include Analysis-Only Snapshots (audit only, never for training)</label>
            <button type="button" className={`toggle${includeAnalysisOnly ? " on" : ""}`} aria-pressed={includeAnalysisOnly} onClick={() => setIncludeAnalysisOnly((v) => !v)} />
          </div>
        </div>
        <button className="btn btn-primary btn-sm mt-12" disabled={busy || !selectedTarget} onClick={doExport}>
          {selectedMeta ? `Export "${selectedMeta.name}"` : "Export"}
        </button>
      </div>
    </div>
  );
}
