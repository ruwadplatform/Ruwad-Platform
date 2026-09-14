/** Ported verbatim from sparklineSvg() (js/widgets.js:30-46). */
export function Sparkline({ values, w = 180, h = 44 }: { values: number[]; w?: number; h?: number }) {
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / range) * (h - pad * 2)]);
  const line = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  const first = pts[0];
  const area = `${line} L${last[0].toFixed(1)},${(h - pad).toFixed(1)} L${first[0].toFixed(1)},${(h - pad).toFixed(1)} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sparkline">
      <line x1={pad} y1={(h - pad).toFixed(1)} x2={w - pad} y2={(h - pad).toFixed(1)} className="spark-baseline" />
      <path d={area} className="spark-area" />
      <path d={line} className="spark-line" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={2.5} className="spark-dot" />
    </svg>
  );
}
