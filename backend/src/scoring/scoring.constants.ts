import { ScoreDataSource } from "../common/enums";

/** Single source of truth for every tunable scoring constant. Never inline
 * these values elsewhere — a future methodology change (a new version,
 * different thresholds, an ML blend) should require editing this file only,
 * so historical rows tagged with an older SCORE_VERSION keep meaning what
 * they meant when they were calculated. */

/** Bumped whenever the methodology changes in a way that would make an old
 * score not directly comparable to a new one. */
export const SCORE_VERSION = "RUWAD-2.0";

/** Version tag on a score calculated on the EXISTING_DATA basis (see ScoringBasis), so it can never be mistaken for, or compared as, a
 * standard score. */
export const SCORE_VERSION_EXISTING_DATA = "RUWAD-2.0-EXISTING-DATA";

/** Of the six factors, at least this many must have a non-null score before
 * an overall RUWĀD Score is shown at all — otherwise status is
 * INSUFFICIENT_DATA. Never average a missing factor as 0. */
export const MIN_FACTOR_COVERAGE = 4;

/** Mean confidence across the computed (non-missing) factors must reach this
 * before status is CALCULATED, even if factor coverage is met — a company
 * with 4 low-confidence factors shouldn't outrank one with 4 solid ones. */
export const MIN_OVERALL_CONFIDENCE = 0.5;

/** Final-score blend weights (Phase 16). RULE_WEIGHT + ML_WEIGHT should sum
 * to 1. With ML_WEIGHT at 0, finalScore is exactly the deterministic score —
 * flipping this on requires a real trained model, not a flag alone. */
export const RULE_WEIGHT = 1;
export const ML_WEIGHT = 0;

/** Bounds every engine and normalizer must respect. */
export const SCORE_MIN = 0;
export const SCORE_MAX = 10;
export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 1;

/** How much a source should be trusted, highest first. A write path funnels
 * through this before it's allowed to replace an existing feature value —
 * a weaker source (e.g. a fresh pitch-deck extraction) must never silently
 * overwrite a stronger one (e.g. a value an admin already verified) except
 * through the admin override path itself, which may always win. Never
 * compared across ties in a way that matters: equal rank still overwrites
 * (a founder correcting their own earlier founder-submitted answer). */
export const SOURCE_RANK: Record<ScoreDataSource, number> = {
  [ScoreDataSource.VERIFIED_DOCUMENT]: 5,
  [ScoreDataSource.ADMIN_ENTERED]: 4,
  [ScoreDataSource.FOUNDER_SUBMITTED]: 3,
  [ScoreDataSource.PITCH_DECK_EXTRACTED]: 2,
  [ScoreDataSource.EXTERNAL_SOURCE]: 1,
  [ScoreDataSource.SYSTEM_DERIVED]: 0,
};
