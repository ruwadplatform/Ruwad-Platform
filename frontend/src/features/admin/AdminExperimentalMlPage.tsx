"use client";

import { useCallback, useEffect, useState } from "react";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { evaluateExperimentalPredictions, fetchExperimentalMonitoring, runExperimentalBatch, type ExperimentalBatchSummary, type ExperimentalMonitoring } from "@/lib/api/experimental-ml";
import { ApiError } from "@/lib/api/client";
import { EXPERIMENTAL_WARNING } from "./ExperimentalMlPanel";
import { StatCard } from "@/components/shared/StatCard";

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

  if (!hydrated) return <div className="mt-20"><LoadingState /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to view experimental ML monitoring." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><ErrorState title="Couldn't load monitoring" body={error} /></div>;
  if (!mon) return <div className="mt-20"><LoadingState /></div>;

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
          <StatCard label="Estimates stored" size={15} value={mon.predictionsStored} />
          <StatCard label="Startups with an estimate" size={15} value={mon.startupsWithPrediction} />
          <StatCard label="Insufficient data" size={15} value={mon.startupsInsufficientData} />
          <StatCard label="Avg feature completeness" size={15} value={<>{mon.averageFeatureCompleteness != null ? `${Math.round(mon.averageFeatureCompleteness * 100)}%` : "—"}</>} />
          <StatCard label="Failures since restart" size={15} value={mon.inferenceFailuresSinceStart} />
        </div>
        {mon.modelProblem && <p className="small muted mt-12">{mon.modelProblem}.</p>}
        <p className="fs-11 muted mt-12">{mon.note}</p>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="card-title">Latest estimate per startup — distribution of raw model output</h3>
        <Distribution data={mon.distribution} />
        <p className="fs-11 muted mt-12">Raw output of an uncalibrated model trained on 15 usable examples; the spread says nothing about real funding odds.</p>
      </div>

      {batch && (
        <div className="panel panel-pad mt-16">
          <h3 className="card-title">Last batch</h3>
          <div className="flex gap-16" style={{ flexWrap: "wrap" }}>
            <StatCard label="Total startups" size={15} value={batch.total} />
            <StatCard label="Sent to model" size={15} value={batch.calledModel} />
            <StatCard label="Predicted" size={15} value={batch.predicted} />
            <StatCard label="Unchanged" size={15} value={batch.unchanged} />
            <StatCard label="Insufficient data" size={15} value={batch.insufficientData} />
            <StatCard label="Failed" size={15} value={batch.failed} />
          </div>
          <div className="mt-12"><Distribution data={batch.distribution} /></div>
          {batch.failures.length > 0 && <ul className="small muted mt-12">{batch.failures.map((f) => <li key={f.startupId}>{f.name}: {f.reason}</li>)}</ul>}
          <p className="fs-11 muted mt-12">{batch.notice}</p>
        </div>
      )}
    </div>
  );
}
