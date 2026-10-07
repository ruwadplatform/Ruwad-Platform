"use client";

import { useEffect, useRef, useState } from "react";
import { fetchStartupAssessment, type AssessmentFactor, type MissingField, type PredictiveModelCard, type StartupAssessment } from "@/lib/api/assessment";

const POLL_MS = 3000;
const POLL_LIMIT = 20; // ~1 minute, then stop quietly; the page still shows whatever is ready

const pct = (v: number) => `${Math.round(v * 100)}%`;
const reliabilityText = (r?: string) => (r === "LOW" ? "Low reliability" : "Very low reliability");

function MissingList({ fields }: { fields: MissingField[] }) {
  if (!fields.length) return null;
  return (
    <ul className="fs-12 muted mt-4" style={{ paddingLeft: 18 }}>
      {fields.map((m) => <li key={m.key}>{m.label} <span className="fs-11">— {m.where}</span></li>)}
    </ul>
  );
}

/** One factor, in the requested compact form: name … score. The explanation and what to add are one click away. */
function FactorRow({ f }: { f: AssessmentFactor }) {
  const unavailable = f.status === "UNAVAILABLE";
  return (
    <details className="panel panel-pad" style={{ padding: "10px 14px" }}>
      <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, cursor: "pointer", listStyle: "none" }}>
        <span className="fs-13">{f.label}</span>
        <span className="mono" style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{unavailable ? <span className="muted">Unavailable</span> : f.score!.toFixed(1)}</span>
      </summary>
      {!unavailable && (
        <div style={{ height: 5, borderRadius: 3, background: "var(--bg-2)", marginTop: 8 }} aria-hidden>
          <div style={{ width: `${(f.score! / 10) * 100}%`, height: 5, borderRadius: 3, background: "var(--info)" }} />
        </div>
      )}
      <p className="small muted mt-8">{f.explanation}</p>
      {!unavailable && <p className="fs-11 muted mt-4">Based on {pct(f.confidence)} of this factor&apos;s inputs.</p>}
      {f.providedFields.length > 0 && <p className="fs-11 muted mt-4">Calculated from what you provided: {f.providedFields.map((p) => p.label).join(", ")}.</p>}
      {f.missingFields.length > 0 && (
        <>
          <p className="fs-11 muted mt-8">{unavailable ? "To calculate this factor, add:" : "To raise the confidence of this factor, add:"}</p>
          <MissingList fields={f.missingFields} />
        </>
      )}
    </details>
  );
}

function PredictiveIntelligence({ m }: { m: PredictiveModelCard }) {
  return (
    <section className="mt-24" aria-label="Predictive Intelligence" data-testid="predictive-intelligence">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 className="fs-15">Predictive Intelligence</h2>
        <span className="badge badge-warn">Experimental</span>
      </div>
      <div className="panel panel-pad mt-8">
        <h3 className="fs-13">{m.title}</h3>
        {m.status === "AVAILABLE" && m.estimatePercent != null ? (
          <>
            <div className="flex gap-16 mt-8" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 30, fontWeight: 600 }}>About {m.estimatePercent}%</span>
              <span className="small muted">{m.label} · {m.band}</span>
            </div>
            <p className="fs-11 muted mt-4">{reliabilityText(m.reliability)}. A rough indication, not a forecast.</p>
          </>
        ) : (
          <p className="small muted mt-8">
            {m.status === "INSUFFICIENT_DATA" ? "Not enough structured data on file for an experimental prediction yet. It is made from whatever you have provided, so adding figures such as revenue, customers or funding rounds lets it run. " : `${m.message} `}
            {m.status === "INSUFFICIENT_DATA" && <a href="/workspace/startup/edit" style={{ textDecoration: "underline" }}>Edit your startup</a>}
          </p>
        )}
        <p className="small mt-12"><b>This experimental prediction is not included in your RUWĀD Score.</b></p>
      </div>
    </section>
  );
}

/** Founder assessment, in two clearly separate parts:
 *   Official Assessment    the RUWĀD Score /10, its six factors, data confidence and explanations (deterministic engines)
 *   Predictive Intelligence the experimental funding outlook (a separate model that never touches the score)
 * Read-only. It never starts scoring; it only shows what the backend has produced, and re-checks briefly while an assessment is still
 * being processed. */
export function StartupAssessmentSection({ startupId }: { startupId: string }) {
  const [a, setA] = useState<StartupAssessment | null>(null);
  const [error, setError] = useState(false);
  const polls = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    polls.current = 0;
    const load = () => {
      fetchStartupAssessment(startupId)
        .then((next) => {
          if (cancelled) return;
          setA(next);
          setError(false);
          if (next.processing && polls.current++ < POLL_LIMIT) timer = setTimeout(load, POLL_MS);
        })
        .catch(() => { if (!cancelled) setError(true); });
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [startupId]);

  if (error && !a) return <div className="panel panel-pad mt-20"><p className="small muted">Your RUWĀD assessment couldn&apos;t be loaded right now. Please refresh in a moment.</p></div>;
  if (!a) return <div className="panel panel-pad mt-20"><p className="small muted">Loading your RUWĀD assessment…</p></div>;

  const s = a.ruwadScore;
  const model = a.predictiveIntelligence.models[0];
  const c = a.completion;
  return (
    <div className="mt-20">
      <section aria-label="Official Assessment">
        <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 className="fs-15">Official Assessment</h2>
          <span className="small muted">Calculated by RUWĀD&apos;s six scoring engines</span>
        </div>

        <div className="panel panel-pad mt-8">
          <div className="flex gap-16" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div>
              <div className="sm-label">RUWĀD Score</div>
              {s.state === "READY" ? (
                <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>{s.value!.toFixed(1)} <span className="muted" style={{ fontSize: 18 }}>/ {s.outOf}</span></div>
              ) : (
                <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>{s.state === "PROCESSING" ? "Processing…" : "Pending"}</div>
              )}
            </div>
            <div className="stat-mini"><div className="sm-label">Data Confidence</div><div className="sm-val fs-15">{s.dataConfidence != null ? pct(s.dataConfidence) : "—"}</div></div>
          </div>
          {s.message && <p className="small muted mt-12">{s.message}</p>}
          {s.basisNote && <p className="fs-11 muted mt-8">{s.basisNote}</p>}
          {c && (
            <div className="mt-12" data-testid="pending-guidance">
              <p className="small"><b>Why it&apos;s pending</b></p>
              <ul className="small muted mt-4" style={{ paddingLeft: 18 }}>
                {c.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
              {c.unavailableFactors.some((f) => f.missingFields.length > 0) && (
                <>
                  <p className="small mt-12"><b>Add this information to complete your assessment</b></p>
                  {c.unavailableFactors.filter((f) => f.missingFields.length > 0).map((f) => (
                    <div key={f.key} className="mt-8">
                      <div className="fs-12">{f.label}</div>
                      <MissingList fields={f.missingFields} />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-8" style={{ display: "grid", gap: 8 }}>
          {a.factors.map((f) => <FactorRow key={f.key} f={f} />)}
        </div>
      </section>

      {model && <PredictiveIntelligence m={model} />}
    </div>
  );
}
