import { SCORE_MAX, SCORE_MIN } from "./scoring.constants";

/** Every normalizer in this file returns a number in [SCORE_MIN, SCORE_MAX]
 * or null — never NaN, never Infinity, never a guess. A missing/invalid
 * input is a missing signal, not a bad score (see the "insufficient data
 * ≠ bad performance" rule this whole module is built around). */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return SCORE_MIN;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, n));
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Linear 0→saturateAt maps to 0→10, clamped both ends. Negative inputs
 * clamp to 0 rather than going negative (a revenue decline is still "0
 * momentum from this input", not an error). */
export function normalizePercentage(value: number | null | undefined, saturateAt: number): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(saturateAt) || saturateAt <= 0) return null;
  return clampScore((value / saturateAt) * SCORE_MAX);
}

/** Same shape as normalizePercentage, named separately because growth rates
 * and plain percentages are conceptually different inputs even though the
 * math is identical — keeps engine code self-documenting. */
export function normalizeGrowthRate(pctGrowth: number | null | undefined, saturateAt = 100): number | null {
  return normalizePercentage(pctGrowth, saturateAt);
}

/** months of runway, saturating at `saturateAt` months (default 18 — a
 * commonly used "healthy runway" bar). Zero or negative runway clamps to 0
 * rather than producing a negative score. */
export function normalizeRunway(months: number | null | undefined, saturateAt = 18): number | null {
  if (!isFiniteNumber(months)) return null;
  return clampScore((Math.max(0, months) / saturateAt) * SCORE_MAX);
}

/** years of relevant experience, saturating at `saturateAt` years (default
 * 15). */
export function normalizeExperience(years: number | null | undefined, saturateAt = 15): number | null {
  if (!isFiniteNumber(years)) return null;
  return clampScore((Math.max(0, years) / saturateAt) * SCORE_MAX);
}

/** 0-based position in a milestone ladder of `totalStages` stages (e.g.
 * stage 3 of 8) maps to 0-10. Returns null for an unrecognized stage rather
 * than guessing a midpoint. */
export function normalizeRegulatoryStage(stageIndex: number | null | undefined, totalStages: number): number | null {
  if (!isFiniteNumber(stageIndex) || !isFiniteNumber(totalStages) || totalStages <= 1) return null;
  if (stageIndex < 0) return null;
  return clampScore((stageIndex / (totalStages - 1)) * SCORE_MAX);
}

/** Strictly parses a market-size figure that may arrive as a clean number
 * or as free text like "SAR 500M" / "$2B" / "USD 1.2 million". Returns null
 * on anything ambiguous rather than guessing — this feeds a public-facing
 * score, so a wrong parse is worse than no parse. Log-scaled against
 * `saturateAtUsd` (default $10B) because market sizes span orders of
 * magnitude and a linear scale would flatten everything under $1B to ~0. */
const SIZE_UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
export function normalizeMarketSize(raw: string | number | null | undefined, saturateAtUsd = 10e9): number | null {
  if (isFiniteNumber(raw)) return raw <= 0 ? null : logScale(raw, saturateAtUsd);
  if (typeof raw !== "string") return null;
  // The unit-word group is deliberately broad ([a-z]+, not an alternation of
  // known units) so an unrecognized trailing word (e.g. "trillion") is
  // actually captured and rejected below, instead of silently matching zero
  // characters and falling through as if no unit were written at all.
  const m = raw.trim().match(/^(?:usd|sar|\$|€|£)?\s*([\d,]+(?:\.\d+)?)\s*([a-z]+)?\b/i);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!isFiniteNumber(amount) || amount <= 0) return null;
  const unit = m[2] ? SIZE_UNIT[m[2].toLowerCase()] : undefined;
  if (m[2] && unit === undefined) return null; // recognized-looking but unmapped unit — don't guess
  return logScale(amount * (unit ?? 1), saturateAtUsd);
}
function logScale(value: number, saturateAt: number): number {
  if (value <= 0 || saturateAt <= 1) return SCORE_MIN;
  return clampScore((Math.log10(value) / Math.log10(saturateAt)) * SCORE_MAX);
}

/** Plain mean of the given numbers; null for an empty list (never divide by
 * zero, never return NaN). */
export function average(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Number.isFinite(sum) ? sum / values.length : null;
}

/** Weighted mean over only the parts that have a value — weights of the
 * missing parts are dropped and the remaining weights re-normalized to sum
 * to 1, so a dimension with 3 of 4 weighted inputs present is still scored
 * fairly off those 3 rather than silently treating the missing one as 0.
 * `coverage` reports how much of the original weight was actually present,
 * for the caller to fold into confidence. */
export function weightedAverage(parts: { value: number | null; weight: number }[]): { value: number | null; coverage: number } {
  const present = parts.filter((p) => isFiniteNumber(p.value) && p.weight > 0);
  const totalWeight = parts.reduce((a, p) => a + (p.weight > 0 ? p.weight : 0), 0);
  const presentWeight = present.reduce((a, p) => a + p.weight, 0);
  if (!present.length || presentWeight <= 0 || totalWeight <= 0) return { value: null, coverage: 0 };
  const value = present.reduce((a, p) => a + (p.value as number) * p.weight, 0) / presentWeight;
  return { value: clampScore(value), coverage: clampConfidence(presentWeight / totalWeight) };
}
