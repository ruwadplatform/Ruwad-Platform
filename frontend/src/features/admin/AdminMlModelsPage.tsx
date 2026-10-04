"use client";

import { useCallback, useEffect, useState } from "react";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import {
  fetchMlModels, updateMlModelStatus, fetchMlTrainingRuns, fetchMlTargets, fetchMlReadiness,
  type MlModel, type MlModelStatus, type MlTrainingRun, type TargetMeta, type ReadinessReport,
} from "@/lib/api/ml-data";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

const STATUS_LABEL: Record<MlModelStatus, string> = {
  TEST_ONLY: "Test Only", CANDIDATE: "Candidate", SHADOW: "Shadow", ACTIVE: "Active", RETIRED: "Retired", REJECTED: "Rejected",
};
function ModelStatusBadge({ status }: { status: MlModelStatus }) {
  const cls: Record<MlModelStatus, string> = {
    TEST_ONLY: "badge-neutral", CANDIDATE: "badge-info", SHADOW: "badge-warn", ACTIVE: "badge-good", RETIRED: "badge-neutral", REJECTED: "badge-crit",
  };
  return <span className={`badge ${cls[status]}`}>{STATUS_LABEL[status]}</span>;
}
function RunStatusBadge({ status }: { status: MlTrainingRun["status"] }) {
  const cls: Record<MlTrainingRun["status"], string> = {
    QUEUED: "badge-neutral", RUNNING: "badge-info", COMPLETED: "badge-good", FAILED: "badge-crit", BLOCKED_NOT_READY: "badge-warn",
  };
  return <span className={`badge ${cls[status]}`}>{status.replace(/_/g, " ")}</span>;
}

// Mirrors the backend's own VALID_TRANSITIONS (ml-model-registry.service.ts)
// so the UI only ever offers a move the backend will actually accept — the
// backend enforces this regardless, this is just so a rejected click never
// surprises an admin.
const NEXT_STATUSES: Record<MlModelStatus, MlModelStatus[]> = {
  TEST_ONLY: [], CANDIDATE: ["SHADOW", "REJECTED"], SHADOW: ["ACTIVE", "RETIRED", "REJECTED"], ACTIVE: ["RETIRED"], RETIRED: [], REJECTED: [],
};

function metricSummary(metrics: Record<string, unknown>): string {
  const test = (metrics as { test?: Record<string, unknown> })?.test;
  if (!test) return "—";
  const auc = test.rocAuc;
  const mae = test.mae;
  if (typeof auc === "number") return `ROC-AUC ${auc.toFixed(3)}`;
  if (typeof mae === "number") return `MAE ${mae.toFixed(3)}`;
  return "—";
}

export function AdminMlModelsPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [models, setModels] = useState<MlModel[] | null>(null);
  const [runs, setRuns] = useState<MlTrainingRun[] | null>(null);
  const [targets, setTargets] = useState<TargetMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [readinessTarget, setReadinessTarget] = useState("");
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);

  const load = useCallback(() => {
    if (!isAdmin) return;
    Promise.all([fetchMlModels(), fetchMlTrainingRuns(), fetchMlTargets()])
      .then(([m, r, t]) => { setModels(m); setRuns(r); setTargets(t); if (!readinessTarget && t.length) setReadinessTarget(t[0].name); })
      .catch((e) => setError(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
  useEffect(load, [load]);

  async function checkReadiness() {
    if (!readinessTarget) return;
    setReadinessBusy(true);
    setReadiness(null);
    try { setReadiness(await fetchMlReadiness(readinessTarget)); }
    catch (e) { toast(errText(e)); }
    finally { setReadinessBusy(false); }
  }

  async function move(model: MlModel, next: MlModelStatus) {
    setBusyId(model.id);
    try { await updateMlModelStatus(model.id, next); toast(`${model.modelVersion} moved to ${STATUS_LABEL[next]}`); load(); }
    catch (e) { toast(errText(e)); }
    finally { setBusyId(null); }
  }

  function confirmMove(model: MlModel, next: MlModelStatus) {
    const destructive = next === "RETIRED" || next === "REJECTED";
    if (!destructive) return move(model, next);
    openModal(
      <ConfirmModal
        title={`Move ${model.modelVersion} to ${STATUS_LABEL[next]}?`}
        body={next === "RETIRED" ? "This model will stop receiving shadow-prediction traffic. Its stored predictions and artifact are kept for audit." : "This model is rejected and can never be promoted again."}
        confirmLabel={STATUS_LABEL[next]}
        danger
        onCancel={closeModal}
        onConfirm={() => { closeModal(); move(model, next); }}
      />,
    );
  }

  if (!hydrated) return <EmptyState icon="reports" title="Loading…" body="" />;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to review ML models." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load ML models" body={error} /></div>;

  return (
    <div>
      <IntelligencePageHeader
        title="ML Models"
        description="Shadow-prediction models trained outside the public RUWĀD Score. Training is CLI-only and never triggered from this page; promoting a model here only changes whether it receives internal shadow-prediction traffic — it never affects a founder's or investor's visible score."
      />

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Train a model</h3>
        <p className="small muted mb-12">Training always runs from the command line, against a local checkout of <code>ml/</code>, and always checks the readiness gate first unless <code>--test-only</code> is passed.</p>
        <div className="grid-2" style={{ alignItems: "end" }}>
          <div className="field">
            <label>Target</label>
            <select className="select" value={readinessTarget} onChange={(e) => { setReadinessTarget(e.target.value); setReadiness(null); }}>
              {(targets ?? []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <button className="btn btn-outline btn-sm" disabled={!readinessTarget || readinessBusy} onClick={checkReadiness}>{readinessBusy ? "Checking…" : "Check Readiness"}</button>
        </div>
        {readiness && (
          <div className="mt-12">
            <span className={`badge ${readiness.ready ? "badge-good" : "badge-warn"}`}>{readiness.ready ? "Ready to train" : "Not ready"}</span>
            <span className="small muted" style={{ marginLeft: 8 }}>{readiness.usableExamples} usable examples ({readiness.positiveExamples} positive / {readiness.negativeExamples} negative), {(readiness.featureCoverage * 100).toFixed(0)}% feature coverage</span>
            {!readiness.ready && readiness.reasons.length > 0 && (
              <ul className="small muted mt-4" style={{ paddingLeft: 18 }}>{readiness.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            )}
          </div>
        )}
        {readinessTarget && (
          <pre className="mt-12 small" style={{ background: "var(--bg-2)", padding: 10, borderRadius: 6, overflowX: "auto" }}>
            {`python -m app.training.train --target ${readinessTarget}`}
          </pre>
        )}
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Registered Models</h3>
        {models === null ? (
          <p className="small muted">Loading…</p>
        ) : models.length === 0 ? (
          <p className="small muted">No models have been registered yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Model Version</th><th>Target</th><th>Algorithm</th><th>Test Metric</th><th>Rows (train/val/test)</th><th>Trained</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}>
                    <td className="small" style={{ fontFamily: "monospace" }}>{m.modelVersion}</td>
                    <td className="small">{m.targetName}</td>
                    <td className="small">{m.algorithm}</td>
                    <td className="small">{metricSummary(m.metrics)}</td>
                    <td className="small">{m.trainingRows}/{m.validationRows}/{m.testRows}</td>
                    <td className="small">{new Date(m.trainedAt).toLocaleDateString()}</td>
                    <td><ModelStatusBadge status={m.status} /></td>
                    <td>
                      <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                        {NEXT_STATUSES[m.status].map((next) => (
                          <button key={next} className={`btn btn-sm ${next === "ACTIVE" || next === "SHADOW" ? "btn-primary" : "btn-outline"}`} disabled={busyId === m.id} onClick={() => confirmMove(m, next)}>
                            {busyId === m.id ? "…" : STATUS_LABEL[next]}
                          </button>
                        ))}
                        {NEXT_STATUSES[m.status].length === 0 && <span className="small muted">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Training Runs</h3>
        {runs === null ? (
          <p className="small muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="small muted">No training runs recorded yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Target</th><th>Algorithm</th><th>Status</th><th>Dataset Rows</th><th>Started</th><th>Model</th><th>Error</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{r.targetName}{r.isTestOnly && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>TEST_ONLY</span>}</td>
                    <td className="small">{r.algorithm}</td>
                    <td><RunStatusBadge status={r.status} /></td>
                    <td className="small">{r.datasetRows ?? "—"}</td>
                    <td className="small">{new Date(r.startedAt).toLocaleString()}</td>
                    <td className="small" style={{ fontFamily: "monospace" }}>{r.modelVersion ?? "—"}</td>
                    <td className="small" style={{ maxWidth: 280, overflowWrap: "anywhere" }}>{r.errorMessage ?? "—"}</td>
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
