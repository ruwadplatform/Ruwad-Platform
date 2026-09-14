/** Ported from the `.kpi`/`.k-label`/`.k-val`/`.k-delta` markup already used
 * across the Dashboard and analytics detail pages (components.css:44-47). */
export function KpiCard({ label, value, delta }: { label: string; value: string | number; delta?: string }) {
  return (
    <div className="kpi">
      <div className="k-label">{label}</div>
      <div className="k-val">{value}</div>
      {delta && <div className="k-delta up">{delta}</div>}
    </div>
  );
}
