import { CHART_COLORS } from "@/data/intelligence";
import type { ChartDatum } from "@/types/intelligence";

/** Ported from barChart() (js/analytics.js:82-85) — horizontal bar-chart
 * rows built from plain CSS (`.bar-chart-row`/`.bar-chart-track`/
 * `.bar-chart-fill`), no chart library. */
export function BarChart({ data, unit }: { data: ChartDatum[]; unit?: string }) {
  if (!data.length) return <p className="small muted">No data available.</p>;
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div>
      {data.map((d, i) => (
        <div className="bar-chart-row" key={d.l}>
          <div className="bl">{d.l}</div>
          <div className="bar-chart-track"><div className="bar-chart-fill" style={{ width: `${(d.v / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} /></div>
          <div className="bv mono">{unit ? `${d.v}${unit}` : d.v.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
