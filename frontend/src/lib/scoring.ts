/** Ported verbatim from js/mock-data.js and js/widgets.js. */

export function initials(n: string): string {
  return n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function slug(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Equal-weighted average of the six sub-scores, scaled to /1000 — matches
 * the methodology the profile's RUWĀD Score tooltip actually states. */
export function compositeScore<T extends object>(sub: T): number {
  const vals = Object.values(sub) as number[];
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10);
}

export interface Provenance {
  lastUpdated: string;
  sources: string[];
  confidence: "High" | "Medium" | "Low";
}

export function valenceColor(val: number, max: number): string {
  const pct = (val / max) * 100;
  return pct >= 70 ? "var(--good)" : pct >= 40 ? "var(--warn)" : "var(--crit)";
}
