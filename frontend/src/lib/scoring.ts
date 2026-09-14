/** Ported verbatim from js/mock-data.js and js/widgets.js. */

export function initials(n: string): string {
  return n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function slug(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const PROVENANCE_SOURCES: Record<"high" | "medium" | "low", string[]> = {
  high: ["RUWĀD analyst review", "Self-reported"],
  medium: ["Self-reported"],
  low: ["Public directory listing"],
};

export function provenanceSeed(str: string): number {
  let seed = 0;
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
  return seed;
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

export function buildProvenance(seedStr: string, confidence: "high" | "medium" | "low", extraSources: string[] = []): Provenance {
  const seed = provenanceSeed(seedStr);
  const daysAgo = seed % 150; // spread across the last ~5 months
  const base = new Date(2026, 7, 30); // "today", per this platform's fixed demo date
  base.setDate(base.getDate() - daysAgo);
  const lastUpdated = base.toISOString().slice(0, 10);
  const sources = [...(PROVENANCE_SOURCES[confidence] ?? PROVENANCE_SOURCES.medium), ...extraSources];
  return { lastUpdated, sources, confidence: confidence === "high" ? "High" : confidence === "low" ? "Low" : "Medium" };
}

/** The old app used Math.random() here — fine in a static-HTML app with no
 * hydration to match, but Next.js SSR would produce a server/client
 * mismatch. Seeded from the same deterministic hash instead; visually
 * identical (still a "CR-######" string), just stable across renders. */
export function seededRegistrationNumber(seedStr: string): string {
  const seed = provenanceSeed(seedStr + ":cr");
  return "CR-" + (100000 + (seed % 899999));
}

export function valenceColor(val: number, max: number): string {
  const pct = (val / max) * 100;
  return pct >= 70 ? "var(--good)" : pct >= 40 ? "var(--warn)" : "var(--crit)";
}
