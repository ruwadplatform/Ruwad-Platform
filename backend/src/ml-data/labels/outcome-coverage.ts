import { OutcomeCoverageType } from "../../common/enums";
import { windowEnd } from "./observation-windows";

/** startup's effective coverage per outcome family: "sources about this
 * family were checked through this ISO date (inclusive)". A family with no
 * entry has NO attested coverage at all. */
export type CoverageMap = Partial<Record<OutcomeCoverageType, string>>;

/** What a single label calculator needs to know about coverage. `through`
 * undefined means "nothing attested for this family". A calculator that
 * receives a gate (even one with no `through`) is in ENFORCED mode. */
export interface CoverageGate {
  through?: string;
}

/** The ONE switch between the two label modes. Every caller of
 * TARGET_REGISTRY[...].calculate must choose explicitly — there is no
 * default, so forgetting is a compile error, not a silent regression.
 *  - enforceCoverage: false  = legacy V1 behaviour (silence after the window
 *    is a negative). Kept ONLY so old numbers stay reproducible for
 *    comparison; never used by the training export or Readiness V2.
 *  - enforceCoverage: true   = V2: a negative needs a matured window AND
 *    attested coverage of that outcome family through the window's end. */
export type LabelContext = { enforceCoverage: false } | { enforceCoverage: true; coverage: CoverageMap };

export const LEGACY_LABEL_CONTEXT: LabelContext = { enforceCoverage: false };

export function coverageLabelContext(coverage: CoverageMap): LabelContext {
  return { enforceCoverage: true, coverage };
}

/** The gate for one family, or undefined in legacy (unchecked) mode. */
export function gateFor(ctx: LabelContext, family: OutcomeCoverageType): CoverageGate | undefined {
  return ctx.enforceCoverage ? { through: ctx.coverage[family] } : undefined;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** The critical negative-label rule: snapshotDate + window <= coverageThrough. */
export function coverageSupportsNegative(gate: CoverageGate | undefined, snapshotAt: Date, windowMonths: number): boolean {
  if (!gate) return true; // legacy / unchecked mode
  if (!gate.through) return false;
  return gate.through >= isoDate(windowEnd(snapshotAt, windowMonths));
}

/** Collapses a startup's attestation rows into one effective date per
 * family: the latest `coverageThrough` among non-revoked rows. Revoked rows
 * are ignored; rows are never edited or deleted. */
export function effectiveCoverage(rows: { coverageType: OutcomeCoverageType; coverageThrough: string; revokedAt?: Date | null }[]): CoverageMap {
  const out: CoverageMap = {};
  for (const r of rows) {
    if (r.revokedAt) continue;
    const cur = out[r.coverageType];
    if (!cur || r.coverageThrough > cur) out[r.coverageType] = r.coverageThrough;
  }
  return out;
}
