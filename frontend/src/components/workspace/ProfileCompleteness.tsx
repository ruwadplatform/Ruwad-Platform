import { RuwadIcon } from "@/components/icons/ruwad-icon";

export interface CompletenessCheck {
  label: string;
  ok: boolean;
}

/** Reuses the `.bar-chart-track`/`.bar-chart-fill` primitive already built
 * for the Intelligence dashboards as a single-value completeness meter,
 * rather than introducing a new progress-bar visual. */
export function ProfileCompleteness({ checks }: { checks: CompletenessCheck[] }) {
  const done = checks.filter((c) => c.ok);
  const missing = checks.filter((c) => !c.ok);
  const pct = Math.round((done.length / checks.length) * 100);

  return (
    <div className="panel panel-pad">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="fs-13" style={{ margin: 0 }}>Profile Completeness</h3>
        <b className="mono fs-15">{pct}%</b>
      </div>
      <div className="bar-chart-track mt-12" style={{ height: 8 }}>
        <div className="bar-chart-fill" style={{ width: `${pct}%`, background: pct >= 80 ? "var(--good)" : pct >= 50 ? "var(--warn)" : "var(--crit)" }} />
      </div>

      <div className="mt-16" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <h4 className="eyebrow mb-8">Completed ({done.length}/{checks.length})</h4>
          {done.map((c) => (
            <div key={c.label} className="small mb-4" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--good)" }}>
              <RuwadIcon name="check" size={12} /> <span style={{ color: "var(--text)" }}>{c.label}</span>
            </div>
          ))}
        </div>
        {missing.length > 0 && (
          <div>
            <h4 className="eyebrow mb-8">Missing</h4>
            {missing.map((c) => (
              <div key={c.label} className="small mb-4" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="badge badge-warn" style={{ padding: "1px 6px" }}>!</span> <span className="muted">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <div className="mt-16 small muted">
          Recommended next step: add {missing[0].label.toLowerCase()} to improve how your profile appears to investors and partners.
        </div>
      )}
    </div>
  );
}
