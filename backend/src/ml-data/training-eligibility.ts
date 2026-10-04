import { SnapshotSelectionMethod, TrainingEligibility } from "../common/enums";

/** Eligibility is derived from HOW a snapshot's date was chosen. A date
 * chosen with knowledge of what happened next (LEGACY_OUTCOME_AWARE) biases
 * the label distribution — the Cohort 3 pilot measured positive rates of
 * 47% / 80% / 87% (6/12/24m) for those rows against about 20% for the fixed
 * calendar grid — so such a row can be analysed but never trained on. An
 * undeclared method is treated the same way: eligibility must be earned by
 * a declared, outcome-blind selection rule, never assumed. */
export function defaultEligibilityFor(method: SnapshotSelectionMethod | null | undefined): TrainingEligibility {
  return method === SnapshotSelectionMethod.FIXED_CALENDAR_GRID || method === SnapshotSelectionMethod.OTHER_PREDECLARED
    ? TrainingEligibility.ELIGIBLE
    : TrainingEligibility.ANALYSIS_ONLY;
}

/** True only for selection methods that are outcome-blind by declaration. */
export function methodMayBeEligible(method: SnapshotSelectionMethod | null | undefined): boolean {
  return defaultEligibilityFor(method) === TrainingEligibility.ELIGIBLE;
}

/** The eligibility actually applied. Defence in depth: even if a row's
 * stored flag says ELIGIBLE, an outcome-aware or undeclared selection method
 * keeps it ANALYSIS_ONLY; an explicit EXCLUDED always stands. */
export function effectiveEligibility(s: { selectionMethod?: SnapshotSelectionMethod | null; trainingEligibility?: TrainingEligibility | null }): TrainingEligibility {
  if (s.trainingEligibility === TrainingEligibility.EXCLUDED) return TrainingEligibility.EXCLUDED;
  if (s.trainingEligibility === TrainingEligibility.ELIGIBLE && methodMayBeEligible(s.selectionMethod)) return TrainingEligibility.ELIGIBLE;
  return TrainingEligibility.ANALYSIS_ONLY;
}
