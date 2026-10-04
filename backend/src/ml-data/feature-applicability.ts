import { FeatureApplicabilityStatus, FeatureCoverageState, ScoreDataSource } from "../common/enums";
import { SOURCE_RANK } from "../scoring/scoring.constants";
import { ML_CORE_FEATURES } from "./ml-data.constants";

/** Pure applicability logic — no database. Three distinct states of "no
 * value" exist and must never be confused:
 *   APPLICABLE_MISSING  we know the feature applies, but have no value
 *   UNKNOWN             nobody has said whether it applies (the default)
 *   NOT_APPLICABLE      someone explicitly declared, with a reason, that it
 *                       does not apply to this company
 * Only NOT_APPLICABLE leaves the coverage denominator. A value that is
 * present always wins: a feature with a value is applicable by definition. */

export interface ApplicabilityRow {
  featureKey: string;
  status: FeatureApplicabilityStatus;
  effectiveDate: string;
  source: ScoreDataSource;
  verified: boolean;
  revokedAt?: Date | null;
}

/** The declaration in force for `featureKey` on `snapshotDate`: the latest
 * non-revoked row effective on or before that date; ties broken by the
 * existing provenance precedence (SOURCE_RANK), then by `verified`. Two
 * equally-ranked, equally-verified rows that disagree are a conflict — never
 * guessed: the result is UNKNOWN. Nothing dated after the snapshot can
 * influence it. */
export function resolveApplicability(rows: ApplicabilityRow[], featureKey: string, snapshotDate: string): FeatureApplicabilityStatus {
  const eligible = rows.filter((r) => r.featureKey === featureKey && !r.revokedAt && r.effectiveDate <= snapshotDate);
  if (!eligible.length) return FeatureApplicabilityStatus.UNKNOWN;
  const latest = eligible.reduce((max, r) => (r.effectiveDate > max ? r.effectiveDate : max), eligible[0].effectiveDate);
  const atLatest = eligible.filter((r) => r.effectiveDate === latest);
  const best = Math.max(...atLatest.map((r) => SOURCE_RANK[r.source] * 2 + (r.verified ? 1 : 0)));
  const top = atLatest.filter((r) => SOURCE_RANK[r.source] * 2 + (r.verified ? 1 : 0) === best);
  const statuses = new Set(top.map((r) => r.status));
  return statuses.size === 1 ? top[0].status : FeatureApplicabilityStatus.UNKNOWN;
}

export const hasValue = (v: unknown): boolean => v !== undefined && v !== null;

export function coverageStateFor(valuePresent: boolean, declared: FeatureApplicabilityStatus): FeatureCoverageState {
  if (valuePresent) return FeatureCoverageState.APPLICABLE_WITH_VALUE;
  if (declared === FeatureApplicabilityStatus.NOT_APPLICABLE) return FeatureCoverageState.NOT_APPLICABLE;
  if (declared === FeatureApplicabilityStatus.APPLICABLE) return FeatureCoverageState.APPLICABLE_MISSING;
  return FeatureCoverageState.UNKNOWN;
}

export type CoreFeatureStates = Record<string, FeatureCoverageState>;

/** Per-core-feature state of ONE snapshot. */
export function snapshotFeatureStates(features: Record<string, unknown>, rows: ApplicabilityRow[], snapshotDate: string, keys: readonly string[] = ML_CORE_FEATURES): CoreFeatureStates {
  const out: CoreFeatureStates = {};
  for (const key of keys) out[key] = coverageStateFor(hasValue(features[key]), resolveApplicability(rows, key, snapshotDate));
  return out;
}

export interface CoverageTally {
  covered: number;
  /** Cells that count in the denominator: everything except NOT_APPLICABLE. */
  applicable: number;
  notApplicable: number;
  /** covered / applicable (0 when nothing is applicable). */
  pct: number;
}

/** Pooled coverage across snapshots: Σ covered / Σ applicable. With no
 * NOT_APPLICABLE cells it equals the V1 figure exactly (present cells /
 * snapshots × core features); each NOT_APPLICABLE cell simply leaves the
 * denominator for its own snapshot. */
export function tallyCoverage(snapshotStates: CoreFeatureStates[]): CoverageTally {
  let covered = 0;
  let notApplicable = 0;
  let cells = 0;
  for (const states of snapshotStates) {
    for (const s of Object.values(states)) {
      cells++;
      if (s === FeatureCoverageState.APPLICABLE_WITH_VALUE) covered++;
      else if (s === FeatureCoverageState.NOT_APPLICABLE) notApplicable++;
    }
  }
  const applicable = cells - notApplicable;
  return { covered, applicable, notApplicable, pct: applicable ? covered / applicable : 0 };
}

/** A NOT_APPLICABLE declaration must be explicit and reasoned. */
export const MIN_NOT_APPLICABLE_REASON_CHARS = 15;
