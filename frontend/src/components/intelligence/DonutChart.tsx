import { CHART_COLORS } from "@/data/intelligence";
import type { ChartDatum } from "@/types/intelligence";

/** Ported from donutChart() (js/analytics.js:86-91) — pure CSS conic-
 * gradient donut, no chart library. */
export function DonutChart({ data }: { data: ChartDatum[] }) {
  if (!data.length) return <p className="small muted">No data available.</p>;
  const total = data.reduce((a, d) => a + d.v, 0) || 1;
  const { parts: stops } = data.reduce<{ acc: number; parts: string[] }>(
    (state, d, i) => {
      const start = (state.acc / total) * 360;
      const acc = state.acc + d.v;
      const end = (acc / total) * 360;
      return { acc, parts: [...state.parts, `${CHART_COLORS[i % CHART_COLORS.length]} ${start}deg ${end}deg`] };
    },
    { acc: 0, parts: [] },
  );
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${stops.join(",")})` }} />
      <div className="donut-legend">
        {data.map((d, i) => (
          <span key={d.l}><i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{d.l} — {d.v}</span>
        ))}
      </div>
    </div>
  );
}
