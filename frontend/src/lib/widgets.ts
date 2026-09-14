/** Ported verbatim from js/widgets.js's generic helper functions. */

export function regBadgeClass(reg: string | undefined | null): string {
  if (!reg) return "badge-neutral";
  const r = reg.toLowerCase();
  if (r.includes("approved") || r.includes("registered")) return "badge-good";
  if (r.includes("concept")) return "badge-neutral";
  return "badge-warn";
}

export function fmtProvenanceDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** Deterministic quarterly trend leading up to a known current value —
 * reconstructed from the reported YoY growth rate, not invented, since
 * there's no real historical time-series in this dataset. */
export function synthesizeQuarterlyTrend(current: number, yoyGrowthPct: number, points: number, seedStr: string): number[] {
  const q = Math.pow(1 + Math.max(yoyGrowthPct, -0.9), 0.25) - 1;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed % 1000) / 1000;
  };
  const vals = new Array(points);
  let v = current;
  for (let i = points - 1; i >= 0; i--) {
    vals[i] = v;
    v = v / (1 + q);
  }
  return vals.map((v: number, i: number) => (i === points - 1 ? v : v * (0.96 + rand() * 0.08)));
}
