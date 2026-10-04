"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchReadinessDashboard, type ReadinessDashboard } from "@/lib/api/historical-performance";
import { ApiError } from "@/lib/api/client";

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

/** "How close are we to a defensible ML training dataset?" — Readiness V2. Every
 * figure is either a gate input (training-eligible snapshots, attested-coverage
 * labels, applicability-aware coverage) or the gap to one; the old V1 numbers sit
 * beside them so the correction is visible, not hidden. */
export function ReadinessV2Panel() {
  const [d, setD] = useState<ReadinessDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchReadinessDashboard().then(setD).catch((e) => setError(errText(e))); }, []);

  if (error) return <div className="panel panel-pad mt-16"><p className="small">Readiness V2 unavailable: {error}</p></div>;
  if (!d) return <div className="panel panel-pad mt-16"><p className="small muted">Loading Readiness V2…</p></div>;

  const v2 = d.readinessV2;
  const v1 = d.readinessV1;
  const th = v2.thresholds;
  const pendingReview = d.submissions.pendingReview + d.submissions.changesRequested;

  return (
    <>
      <div className="panel panel-pad mt-16">
        <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fs-13">Readiness V2 — {d.focusTarget}</h3>
          <span className={`badge ${v2.ready ? "badge-good" : "badge-warn"}`}>{v2.ready ? "Ready" : "Not ready — training blocked"}</span>
        </div>
        <p className="small muted mt-8">Counts training-eligible snapshots only, labels a negative only where the outcome family was attested through the window, and excludes not-applicable features from coverage. Thresholds are unchanged.</p>
        <div className="stat-mini-row mt-12">
          <div className="stat-mini"><div className="sm-label">Usable examples</div><div className="sm-val fs-15">{v2.usableExamples} / {th?.minTrainingRows ?? 200}</div></div>
          <div className="stat-mini"><div className="sm-label">Positive</div><div className="sm-val fs-15">{v2.positiveExamples} / {th?.minPositiveRows ?? 40}</div></div>
          <div className="stat-mini"><div className="sm-label">Negative</div><div className="sm-val fs-15">{v2.negativeExamples} / {th?.minNegativeRows ?? 40}</div></div>
          <div className="stat-mini"><div className="sm-label">Unknown (no attested coverage)</div><div className="sm-val fs-15">{v2.unknownExamples ?? 0}</div></div>
          <div className="stat-mini"><div className="sm-label">Core coverage</div><div className="sm-val fs-15">{pct(v2.featureCoverage)} / {pct(th?.minCoreFeatureCoverage ?? 0.6)}</div></div>
        </div>
        <div className="scroll-x mt-12">
          <table className="data-table">
            <thead><tr><th></th><th>Usable</th><th>Positive</th><th>Negative</th><th>Core coverage</th></tr></thead>
            <tbody>
              <tr><td className="small">Before (V1: every snapshot, silence = negative)</td><td className="small">{v1.usableExamples}</td><td className="small">{v1.positiveExamples}</td><td className="small">{v1.negativeExamples}</td><td className="small">{pct(v1.featureCoverage)}</td></tr>
              <tr><td className="small"><b>Now (V2)</b></td><td className="small"><b>{v2.usableExamples}</b></td><td className="small"><b>{v2.positiveExamples}</b></td><td className="small"><b>{v2.negativeExamples}</b></td><td className="small"><b>{pct(v2.featureCoverage)}</b></td></tr>
              <tr><td className="small muted">Still needed</td><td className="small">{d.gap.usableNeeded}</td><td className="small">{d.gap.positiveNeeded}</td><td className="small">{d.gap.negativeNeeded}</td><td className="small">{d.gap.coverageGapPoints} pts</td></tr>
            </tbody>
          </table>
        </div>
        {v2.reasons.length > 0 && <ul className="small mt-12" style={{ paddingLeft: 18 }}>{v2.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        {(v2.warnings ?? []).length > 0 && <ul className="small muted mt-8" style={{ paddingLeft: 18 }}>{(v2.warnings ?? []).map((r) => <li key={r}>{r}</li>)}</ul>}
      </div>

      <div className="insight-row mt-16" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Snapshots by training eligibility</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Training-eligible</div><div className="sm-val fs-15">{d.snapshots.eligible}</div></div>
            <div className="stat-mini"><div className="sm-label">Analysis-only</div><div className="sm-val fs-15">{d.snapshots.analysisOnly}</div></div>
            <div className="stat-mini"><div className="sm-label">Excluded</div><div className="sm-val fs-15">{d.snapshots.excluded}</div></div>
          </div>
          <p className="small muted mt-8">{Object.entries(d.snapshots.byMethod).map(([k, n]) => `${k.replace(/_/g, " ").toLowerCase()}: ${n}`).join(" · ")}</p>
          <p className="small muted mt-8">Outcome-aware (legacy) snapshots are kept for analysis and never enter the default training export.</p>
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Evidence &amp; review queue</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Verified evidence</div><div className="sm-val fs-15">{d.evidence.verifiedPct}%</div></div>
            <div className="stat-mini"><div className="sm-label">Open conflicts</div><div className="sm-val fs-15">{d.evidence.openConflicts}</div></div>
            <div className="stat-mini"><div className="sm-label">Awaiting review</div><div className="sm-val fs-15">{pendingReview}</div></div>
          </div>
          <div className="flex gap-8 mt-12">
            <Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical/review">Review founder entries</Link>
            <Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical/conflicts">Evidence conflicts</Link>
          </div>
        </div>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Core feature applicability (eligible snapshots)</h3>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Feature</th><th>With value</th><th>Applicable, missing</th><th>Unknown</th><th>Not applicable</th></tr></thead>
            <tbody>
              {d.featureApplicability.map((f) => (
                <tr key={f.key}><td className="small">{f.key}</td><td className="small">{f.withValue}</td><td className="small">{f.applicableMissing}</td><td className="small">{f.unknown}</td><td className="small">{f.notApplicable}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted mt-8">&ldquo;Unknown&rdquo; means nobody has said whether the feature applies. It stays in the coverage denominator; only an explicit, reasoned not-applicable declaration leaves it.</p>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Outcome coverage attested, by family</h3>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Outcome family</th><th>Startups attested</th><th>Earliest through</th><th>Latest through</th></tr></thead>
            <tbody>
              {d.outcomeCoverage.map((c) => (
                <tr key={c.family}><td className="small">{c.family}</td><td className="small">{c.startupsAttested} / {c.totalStartups}</td><td className="small">{c.earliestThrough ?? "—"}</td><td className="small">{c.latestThrough ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted mt-8">A negative label needs coverage of its own family through the end of the window. Funding coverage never licenses a regulatory, survival or market-entry negative.</p>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Labels by target (V2, eligible snapshots)</h3>
        <div className="scroll-x">
          <table className="data-table">
            <thead><tr><th>Target</th><th>Family</th><th>Positive</th><th>Negative</th><th>Unknown</th><th>Not matured</th><th>Other</th></tr></thead>
            <tbody>
              {d.labels.map((l) => (
                <tr key={l.target}>
                  <td className="small">{l.target}</td><td className="small">{l.coverageFamily}</td>
                  <td className="small">{l.positive}</td><td className="small">{l.valueType === "boolean" ? l.negative : "—"}</td>
                  <td className="small">{l.unknown}</td><td className="small">{l.notMatured}</td>
                  <td className="small">{l.insufficientData + l.unverified + l.excluded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(d.caveats.unverifiedShutdownEvents > 0 || d.caveats.estimatedFoundingYears > 0) && (
          <ul className="small muted mt-8" style={{ paddingLeft: 18 }}>
            {d.caveats.unverifiedShutdownEvents > 0 && <li>{d.caveats.unverifiedShutdownEvents} shutdown event(s) are unverified (status-only); they cannot create a survival label.</li>}
            {d.caveats.estimatedFoundingYears > 0 && <li>{d.caveats.estimatedFoundingYears} startup(s) have an estimated founding year.</li>}
          </ul>
        )}
      </div>
    </>
  );
}
