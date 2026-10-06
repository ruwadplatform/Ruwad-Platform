"use client";

import { useEffect, useState } from "react";
import { fetchStartupAssessment, type AssessmentFactor } from "@/lib/api/assessment";

/** Owner-only, inside the RUWĀD Score card: "Want to improve your RUWĀD score?" with exactly what to add, grouped by factor and ordered
 * from the weakest factor up. Everything comes from the backend assessment (which fields are missing and where they live in the form);
 * nothing is calculated here. Renders nothing while loading, on any error, or when there is nothing left to add. */
export function ImproveScorePrompt({ entityId }: { entityId?: string }) {
  const [factors, setFactors] = useState<AssessmentFactor[] | null>(null);

  useEffect(() => {
    if (!entityId) return;
    let live = true;
    fetchStartupAssessment(entityId).then((a) => { if (live) setFactors(a.factors); }).catch(() => undefined);
    return () => { live = false; };
  }, [entityId]);

  const todo = (factors ?? []).filter((f) => f.missingFields.length > 0).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  if (!todo.length) return null;

  return (
    <details className="rscore-improve" data-testid="improve-score">
      <summary>Want to improve your RUWĀD score?</summary>
      <p className="rscore-improve-lead">Add this information and your score updates automatically. A factor with no information counts as 0.</p>
      {todo.map((f) => (
        <div className="rscore-improve-factor" key={f.key}>
          <div className="rscore-row">
            <span className="rscore-label">{f.label}</span>
            <span className="rscore-value">{(f.score ?? 0).toFixed(1)}</span>
          </div>
          <ul>
            {f.missingFields.map((m) => <li key={m.key}>{m.label} <span>· {m.where}</span></li>)}
          </ul>
        </div>
      ))}
      <a className="btn btn-primary rscore-improve-cta" href="/workspace/startup/edit">Update my information</a>
    </details>
  );
}
