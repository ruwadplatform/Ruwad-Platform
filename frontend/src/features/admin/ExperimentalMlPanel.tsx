"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/shell/ToastProvider";
import { fetchExperimentalForStartup, runExperimentalForStartup, type ExperimentalStartupView } from "@/lib/api/experimental-ml";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

export const EXPERIMENTAL_WARNING = "Experimental prediction. Not used in the RUWĀD Score. Model trained on a limited historical dataset.";

/** A rough band, deliberately not a percentage: the model is uncalibrated, so a precise number would imply accuracy that does not exist. */
export function likelihoodBand(p: number): string {
  if (p < 0.2) return "Lower";
  if (p < 0.4) return "Lower–moderate";
  if (p < 0.6) return "Moderate";
  if (p < 0.8) return "Moderate–higher";
  return "Higher";
}

const OUTCOME_TEXT: Record<string, string> = {
  DISABLED: "Experimental inference is switched off on this server.",
  MODEL_UNAVAILABLE: "No usable experimental model is configured.",
  INSUFFICIENT_DATA: "Not enough structured data for this startup — no estimate was produced.",
  UNCHANGED: "Inputs are unchanged since the last estimate — nothing new was stored.",
  PREDICTED: "New experimental estimate stored.",
  FAILED: "The experimental service did not answer. RUWĀD scoring is unaffected.",
};

const reliabilityText = (r: string | null) => (r ?? "VERY_LOW").replace("_", " ").toLowerCase();

/** Admin-only. Shown beside the RUWĀD Score and never merged with it. */
export function ExperimentalMlPanel({ startupId }: { startupId: string }) {
  const toast = useToast();
  const [view, setView] = useState<ExperimentalStartupView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchExperimentalForStartup(startupId).then(setView).catch((e) => setError(errText(e)));
  }, [startupId]);
  useEffect(load, [load]);

  async function refresh() {
    setBusy(true);
    try {
      const out = await runExperimentalForStartup(startupId);
      toast(OUTCOME_TEXT[out.status] ?? out.status);
      load();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  const p = view?.prediction ?? null;
  return (
    <div className="panel panel-pad mt-16">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 className="fs-13">Experimental ML <span className="badge badge-warn">Experimental</span></h3>
        <button className="btn btn-outline btn-sm" disabled={busy || !view?.enabled} onClick={refresh}>Refresh estimate</button>
      </div>
      <p className="small muted mt-8">{EXPERIMENTAL_WARNING}</p>
      {error && <p className="small mt-8">Couldn&apos;t load the experimental estimate: {error}</p>}
      {view && !view.enabled && <p className="small muted mt-8">Experimental inference is switched off on this server, so no new estimates are produced.</p>}
      {view?.modelProblem && <p className="small muted mt-8">{view.modelProblem}.</p>}
      {view && !p && view.currentStatus === "INSUFFICIENT_DATA" && <p className="small muted mt-8">Insufficient structured data for an experimental prediction. No number was produced.</p>}
      {view && !p && view.currentStatus !== "INSUFFICIENT_DATA" && <p className="small muted mt-8">No experimental estimate has been produced for this startup yet.</p>}
      {view && p && (
        <>
          <div className="flex gap-16 mt-12" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <div className="stat-mini"><div className="sm-label">Experimental funding likelihood estimate</div><div className="sm-val fs-15">{likelihoodBand(p.prediction)}</div></div>
            <div className="stat-mini"><div className="sm-label">Target</div><div className="sm-val fs-15">New funding round within 6 months</div></div>
            <div className="stat-mini"><div className="sm-label">Reliability</div><span className="badge badge-neutral">{reliabilityText(p.reliability)}</span></div>
            <div className="stat-mini"><div className="sm-label">Feature completeness</div><div className="sm-val fs-15">{p.featureCompleteness != null ? `${Math.round(p.featureCompleteness * 100)}%` : "—"}</div></div>
          </div>
          <div className="flex gap-16 mt-12" style={{ flexWrap: "wrap" }}>
            <div className="stat-mini"><div className="sm-label">Model</div><div className="sm-val fs-12 mono">{p.modelVersion}</div></div>
            <div className="stat-mini"><div className="sm-label">Training examples</div><div className="sm-val fs-15">{view.model?.trainingRows ?? "—"}{view.model?.positiveCount != null ? ` (${view.model.positiveCount} funded / ${view.model.negativeCount} not)` : ""}</div></div>
            <div className="stat-mini"><div className="sm-label">Estimated</div><div className="sm-val fs-15">{new Date(p.predictedAt).toLocaleString()}</div></div>
            <div className="stat-mini"><div className="sm-label">Feature schema</div><div className="sm-val fs-12 mono">{p.featureSchemaVersion ?? "—"}</div></div>
          </div>
          <p className="fs-11 muted mt-12">Raw model output {p.prediction.toFixed(2)} — uncalibrated; the sample is far too small for it to be read as a probability. The model was chosen by hand, not statistically selected.</p>
        </>
      )}
      {view && view.history.length > 1 && (
        <details className="mt-12">
          <summary className="small muted">Earlier estimates ({view.history.length - 1})</summary>
          <div className="scroll-x mt-8">
            <table className="data-table">
              <thead><tr><th>When</th><th>Band</th><th>Reliability</th><th>Completeness</th></tr></thead>
              <tbody>
                {view.history.slice(1).map((h) => (
                  <tr key={h.id}>
                    <td className="small">{new Date(h.predictedAt).toLocaleString()}</td>
                    <td className="small">{likelihoodBand(h.prediction)}</td>
                    <td className="small">{reliabilityText(h.reliability)}</td>
                    <td className="small">{h.featureCompleteness != null ? `${Math.round(h.featureCompleteness * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
