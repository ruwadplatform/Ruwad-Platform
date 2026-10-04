"use client";

import { useEffect, useRef, useState } from "react";
import { fetchStartupAssessment, type AssessmentFactor, type PredictiveModelCard, type StartupAssessment } from "@/lib/api/assessment";

const POLL_MS = 3000;
const POLL_LIMIT = 20; // ~1 minute, then stop quietly; the page still shows whatever is ready

const pct = (v: number) => `${Math.round(v * 100)}%`;
const reliabilityText = (r?: string) => (r === "LOW" ? "Low reliability" : "Very low reliability");

function FactorRow({ f }: { f: AssessmentFactor }) {
  const pending = f.score == null;
  return (
    <div className="panel panel-pad">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h4 className="fs-13">{f.label}</h4>
        <span className="mono" style={{ fontSize: 18 }}>{pending ? "Pending" : f.score!.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--bg-2)", marginTop: 8 }} aria-hidden>
        <div style={{ width: pending ? 0 : `${(f.score! / 10) * 100}%`, height: 6, borderRadius: 3, background: "var(--info)" }} />
      </div>
      <p className="small muted mt-8">{f.explanation}</p>
      {pending && f.missingInputs.length > 0 && <p className="fs-11 muted mt-4">Add: {f.missingInputs.join(", ")}</p>}
    </div>
  );
}

function PredictiveCard({ m }: { m: PredictiveModelCard }) {
  return (
    <div className="panel panel-pad mt-16" data-testid="predictive-intelligence">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 className="fs-13">Predictive Intelligence</h3>
        <span className="badge badge-warn">Experimental</span>
      </div>
      <h4 className="fs-13 mt-12">{m.title}</h4>
      {m.status === "AVAILABLE" && m.estimatePercent != null ? (
        <>
          <div className="flex gap-16 mt-8" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 30, fontWeight: 600 }}>About {m.estimatePercent}%</span>
            <span className="small muted">{m.label} · {m.band}</span>
          </div>
          <p className="fs-11 muted mt-4">{reliabilityText(m.reliability)}. A rough indication, not a forecast.</p>
        </>
      ) : (
        <p className="small muted mt-8">{m.message}</p>
      )}
      <p className="small muted mt-12">{m.disclaimer.replace("RUWAD", "RUWĀD")}</p>
      <p className="small mt-4"><b>Not used in your RUWĀD Score.</b></p>
    </div>
  );
}

/** Founder assessment: the official RUWĀD Score and its six factors, then — separately — the experimental Predictive Intelligence card.
 * Read-only. It never starts scoring itself; it only shows what the backend has produced, and re-checks briefly while an assessment is
 * still being processed. */
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
  return (
    <section className="mt-20" aria-label="RUWĀD assessment">
      <div className="panel panel-pad">
        <div className="flex gap-16" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <div>
            <div className="sm-label">RUWĀD Score</div>
            {s.state === "READY" ? (
              <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>{s.value!.toFixed(1)} <span className="muted" style={{ fontSize: 18 }}>/ {s.outOf}</span></div>
            ) : (
              <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>Pending</div>
            )}
          </div>
          <div className="stat-mini"><div className="sm-label">Data Confidence</div><div className="sm-val fs-15">{s.dataConfidence != null ? pct(s.dataConfidence) : "—"}</div></div>
        </div>
        {s.message && <p className="small muted mt-12">{s.message}</p>}
      </div>

      <div className="mt-16" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {a.factors.map((f) => <FactorRow key={f.key} f={f} />)}
      </div>

      {model && <PredictiveCard m={model} />}
    </section>
  );
}
