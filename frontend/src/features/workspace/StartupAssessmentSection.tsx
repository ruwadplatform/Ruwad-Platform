"use client";

import { useEffect, useRef, useState } from "react";
import { fetchStartupAssessment, type AssessmentFactor, type MissingField, type PredictiveModelCard, type StartupAssessment } from "@/lib/api/assessment";

const POLL_MS = 3000;
const POLL_LIMIT = 20; // ~1 minute, then stop quietly; the page still shows whatever is ready

const GAUGE_SIZE = 132;
const GAUGE_RADIUS = 56;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));
const reliabilityText = (r?: string) => (r === "LOW" ? "Low reliability" : "Very low reliability");

function MissingList({ fields }: { fields: MissingField[] }) {
  if (!fields.length) return null;
  return (
    <ul className="ms-list">
      {fields.map((m) => <li key={m.key}>{m.label} <span>· {m.where}</span></li>)}
    </ul>
  );
}

/** One factor: name, a bar and the score on a single line; the explanation, what it was built from and what would raise it open below. */
function FactorRow({ f }: { f: AssessmentFactor }) {
  const unavailable = f.status === "UNAVAILABLE";
  const value = unavailable ? null : f.score!;
  return (
    <details className="ms-factor">
      <summary>
        <span className="ms-factor-name">{f.label}</span>
        <span className="ms-factor-bar" aria-hidden><span style={{ width: `${value != null ? clampPct(value * 10) : 0}%` }} /></span>
        <span className="ms-factor-score">{value != null ? value.toFixed(1) : "—"}</span>
      </summary>
      <div className="ms-factor-body">
        <p>{f.explanation}</p>
        {!unavailable && <p className="ms-fine">Based on {pct(f.confidence)} of this factor&apos;s inputs.</p>}
        {f.providedFields.length > 0 && <p className="ms-fine">Calculated from what you provided: {f.providedFields.map((p) => p.label).join(", ")}.</p>}
        {f.missingFields.length > 0 && (
          <>
            <p className="ms-fine ms-fine-strong">{unavailable ? "To calculate this factor, add:" : "To raise this factor, add:"}</p>
            <MissingList fields={f.missingFields} />
          </>
        )}
      </div>
    </details>
  );
}

function PredictiveIntelligence({ m }: { m: PredictiveModelCard }) {
  return (
    <section className="ms-card ms-predictive" aria-label="Predictive Intelligence" data-testid="predictive-intelligence">
      <header className="ms-card-head">
        <div>
          <h3>Predictive Intelligence</h3>
          <p>{m.title}</p>
        </div>
        <span className="badge badge-warn">Experimental</span>
      </header>
      {m.status === "AVAILABLE" && m.estimatePercent != null ? (
        <div className="ms-predictive-body">
          <div className="ms-predictive-value">About {m.estimatePercent}%</div>
          <p className="ms-fine">{m.label} · {m.band}</p>
          <p className="ms-fine">{reliabilityText(m.reliability)}. A rough indication, not a forecast.</p>
        </div>
      ) : (
        <p className="ms-muted">
          {m.status === "INSUFFICIENT_DATA" ? "Not enough structured data on file for an experimental prediction yet. It is made from whatever you have provided, so adding figures such as revenue, customers or funding rounds lets it run. " : `${m.message} `}
          {m.status === "INSUFFICIENT_DATA" && <a href="/workspace/startup/edit" className="ms-link">Edit your startup</a>}
        </p>
      )}
      <p className="ms-notice">This experimental prediction is not included in your RUWĀD Score.</p>
    </section>
  );
}

function ScoreGauge({ value }: { value: number }) {
  const score = clampPct(value * 10);
  return (
    <div className="ms-gauge" role="img" aria-label={`RUWĀD Score ${value.toFixed(1)} out of 10`}>
      <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
        <circle className="ms-gauge-track" cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS} fill="none" strokeWidth={10} />
        <circle className="ms-gauge-fill" cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS} fill="none" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${(score / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`} />
      </svg>
      <div className="ms-gauge-val"><b>{value.toFixed(1)}</b><span>out of 10</span></div>
    </div>
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

  if (error && !a) return <section className="ms-card"><p className="ms-muted">Your RUWĀD assessment couldn&apos;t be loaded right now. Please refresh in a moment.</p></section>;
  if (!a) return <section className="ms-card"><p className="ms-muted">Loading your RUWĀD assessment…</p></section>;

  const s = a.ruwadScore;
  const model = a.predictiveIntelligence.models[0];
  const c = a.completion;
  return (
    <>
      <section aria-label="Official Assessment">
        <div className="ms-section-head">
          <h2>Official Assessment</h2>
          <span>Calculated by RUWĀD&apos;s six scoring engines</span>
        </div>

        <div className="ms-assess">
          <div className="ms-card ms-score">
            <div className="ms-eyebrow">RUWĀD Score</div>
            {s.state === "READY" ? <ScoreGauge value={s.value!} /> : <div className="ms-score-pending">{s.state === "PROCESSING" ? "Processing…" : "Pending"}</div>}
            <div className="ms-confidence">
              <div className="ms-confidence-row"><span>Data Confidence</span><b>{s.dataConfidence != null ? pct(s.dataConfidence) : "—"}</b></div>
              <div className="ms-bar" role="progressbar" aria-label="Data Confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.dataConfidence != null ? Math.round(s.dataConfidence * 100) : undefined}>
                <span style={{ width: `${s.dataConfidence != null ? clampPct(s.dataConfidence * 100) : 0}%` }} />
              </div>
            </div>
            {s.message && <p className="ms-fine">{s.message}</p>}
            {s.basisNote && <p className="ms-fine">{s.basisNote}</p>}
            {c && (
              <div className="ms-pending" data-testid="pending-guidance">
                <p className="ms-fine ms-fine-strong">Why it&apos;s pending</p>
                <ul className="ms-list">{c.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            )}
          </div>

          <div className="ms-card ms-breakdown">
            <header className="ms-card-head">
              <div>
                <h3>Score breakdown</h3>
                <p>Open a factor to see what it was calculated from and what would raise it.</p>
              </div>
            </header>
            <div className="ms-factors">
              {a.factors.map((f) => <FactorRow key={f.key} f={f} />)}
            </div>
            {c && c.unavailableFactors.some((f) => f.missingFields.length > 0) && (
              <div className="ms-pending">
                <p className="ms-fine ms-fine-strong">Add this information to complete your assessment</p>
                {c.unavailableFactors.filter((f) => f.missingFields.length > 0).map((f) => (
                  <div key={f.key} className="ms-pending-factor">
                    <span>{f.label}</span>
                    <MissingList fields={f.missingFields} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {model && <PredictiveIntelligence m={model} />}
    </>
  );
}
