"use client";

import { useCallback, useEffect, useState } from "react";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { evaluateExperimentalPredictions, fetchExperimentalMonitoring, runExperimentalBatch, type ExperimentalBatchSummary, type ExperimentalMonitoring } from "@/lib/api/experimental-ml";
import { ApiError } from "@/lib/api/client";
import { EXPERIMENTAL_WARNING } from "./ExperimentalMlPanel";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

function Distribution({ data }: { data: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {Object.entries(data).map(([bucket, n]) => (
        <div key={bucket} className="flex gap-8" style={{ alignItems: "center" }}>
          <span className="mono small" style={{ width: 72 }}>{bucket}</span>
          <div style={{ flex: 1, background: "var(--bg-2)", borderRadius: 3, height: 10 }}>
            <div style={{ width: `${(n / max) * 100}%`, height: 10, borderRadius: 3, background: "var(--info)" }} />
          </div>
          <span className="small" style={{ width: 24, textAlign: "right" }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

/** Internal monitoring for the experimental model. Reports volumes and distribution only: there is no accuracy figure because no live
 * prediction has had its outcome window mature. */
export function AdminExperimentalMlPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const [mon, setMon] = useState<ExperimentalMonitoring | null>(null);
  const [batch, setBatch] = useState<ExperimentalBatchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchExperimentalMonitoring().then(setMon).catch((e) => setError(errText(e)));
  }, [isAdmin]);
  useEffect(load, [load]);

  async function runBatch() {
    setBusy(true);
    try {
      const s = await runExperimentalBatch();
      setBatch(s);
      toast(`Batch finished — ${s.predicted} stored, ${s.insufficientData} insufficient, ${s.failed} failed`);
      load();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }
  async function evaluate() {
    setBusy(true);
    try {
      const r = await evaluateExperimentalPredictions();
      toast(`${r.evaluated} matured estimate(s) compared with outcomes, ${r.stillOpen} still open`);
      load();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to view experimental ML monitoring." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load monitoring" body={error} /></div>;
  if (!mon) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;

  return (
    <div>
      <IntelligencePageHeader
        title="Experimental ML"
        description={EXPERIMENTAL_WARNING}
        action={(
          <div className="flex gap-8">
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={evaluate}>Compare matured outcomes</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !mon.enabled} onClick={runBatch}>Run batch for all startups</button>
          </div>
        )}
      />

      <div className="panel panel-pad mt-16">
        <div className="flex gap-16" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <div className="stat-mini"><div className="sm-label">Inference</div><span className={`badge ${mon.enabled ? "badge-good" : "badge-neutral"}`}>{mon.enabled ? "On" : "Off"}</span></div>
          <div className="stat-mini"><div className="sm-label">Model (manually configured)</div><div className="sm-val fs-12 mono">{mon.selectedModelVersion ?? "none"}</div></div>
          <div className="stat-mini"><div className="sm-label">Registry status</div><span className="badge badge-warn">{mon.modelStatus ?? "—"}</span></div>
          <div className="stat-mini"><div className="sm-label">Estimates stored</div><div className="sm-val fs-15">{mon.predictionsStored}</div></div>
          <div className="stat-mini"><div className="sm-label">Startups with an estimate</div><div className="sm-val fs-15">{mon.startupsWithPrediction}</div></div>
          <div className="stat-mini"><div className="sm-label">Insufficient data</div><div className="sm-val fs-15">{mon.startupsInsufficientData}</div></div>
          <div className="stat-mini"><div className="sm-label">Avg feature completeness</div><div className="sm-val fs-15">{mon.averageFeatureCompleteness != null ? `${Math.round(mon.averageFeatureCompleteness * 100)}%` : "—"}</div></div>
          <div className="stat-mini"><div className="sm-label">Failures since restart</div><div className="sm-val fs-15">{mon.inferenceFailuresSinceStart}</div></div>
        </div>
        {mon.modelProblem && <p className="small muted mt-12">{mon.modelProblem}.</p>}
        <p className="fs-11 muted mt-12">{mon.note}</p>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Latest estimate per startup — distribution of raw model output</h3>
        <Distribution data={mon.distribution} />
        <p className="fs-11 muted mt-12">Raw output of an uncalibrated model trained on 15 usable examples; the spread says nothing about real funding odds.</p>
      </div>

      {batch && (
        <div className="panel panel-pad mt-16">
          <h3 className="fs-13 mb-12">Last batch</h3>
          <div className="flex gap-16" style={{ flexWrap: "wrap" }}>
            <div className="stat-mini"><div className="sm-label">Total startups</div><div className="sm-val fs-15">{batch.total}</div></div>
            <div className="stat-mini"><div className="sm-label">Sent to model</div><div className="sm-val fs-15">{batch.calledModel}</div></div>
            <div className="stat-mini"><div className="sm-label">Predicted</div><div className="sm-val fs-15">{batch.predicted}</div></div>
            <div className="stat-mini"><div className="sm-label">Unchanged</div><div className="sm-val fs-15">{batch.unchanged}</div></div>
            <div className="stat-mini"><div className="sm-label">Insufficient data</div><div className="sm-val fs-15">{batch.insufficientData}</div></div>
            <div className="stat-mini"><div className="sm-label">Failed</div><div className="sm-val fs-15">{batch.failed}</div></div>
          </div>
          <div className="mt-12"><Distribution data={batch.distribution} /></div>
          {batch.failures.length > 0 && <ul className="small muted mt-12">{batch.failures.map((f) => <li key={f.startupId}>{f.name}: {f.reason}</li>)}</ul>}
          <p className="fs-11 muted mt-12">{batch.notice}</p>
        </div>
      )}
    </div>
  );
}
