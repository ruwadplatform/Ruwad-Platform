import { Injectable } from "@nestjs/common";
import { FeatureCoverageState, LabelStatus, TrainingEligibility } from "../common/enums";
import { ML_CORE_FEATURES, ML_READINESS_THRESHOLDS } from "./ml-data.constants";
import { getTarget } from "./labels/target-registry";
import { tallyCoverage } from "./feature-applicability";
import { effectiveEligibility } from "./training-eligibility";
import { MlTrainingDataService, TrainingWorld } from "./ml-training-data.service";

/** Bumped when the MEANING of "ready" changes, so an old number is never
 * mistaken for a new one.
 *  1 = every snapshot counts; silence after the window is a negative; coverage
 *      = share of the six core features that have a value.
 *  2 = training-ELIGIBLE snapshots only; a negative needs attested outcome
 *      coverage; coverage excludes NOT_APPLICABLE features from the
 *      denominator. The thresholds themselves did not change. */
export const READINESS_VERSION = 2;

export interface ReadinessThresholds {
  minTrainingRows: number;
  minPositiveRows: number;
  minNegativeRows: number;
  minCoreFeatureCoverage: number;
}

export interface FeatureCoverageDetail {
  key: string;
  withValue: number;
  applicableMissing: number;
  unknown: number;
  notApplicable: number;
}

export interface ReadinessReport {
  readinessVersion: number;
  ready: boolean;
  target: string;
  usableExamples: number;
  positiveExamples: number;
  negativeExamples: number;
  /** Core-feature coverage (0..1) over the rows that would actually be trained on. V2: NOT_APPLICABLE cells leave the denominator. */
  featureCoverage: number;
  reasons: string[];
  /** Non-blocking observations (V2 only). */
  warnings?: string[];

  // ---- V2 detail ----
  totalSnapshots?: number;
  trainingEligibleSnapshots?: number;
  analysisOnlySnapshots?: number;
  excludedSnapshots?: number;
  /** Matured, no event on file, family never attested through the window — NOT counted as negative. */
  unknownExamples?: number;
  notMatured?: number;
  insufficientData?: number;
  unverified?: number;
  excludedByApplicability?: number;
  /** Same coverage measure over ALL eligible snapshots (labelled or not). */
  featureCoverageAllEligible?: number;
  coverageCells?: { covered: number; applicable: number; notApplicable: number };
  perFeature?: FeatureCoverageDetail[];
  thresholds?: ReadinessThresholds;
}

export const readinessThresholds = (): ReadinessThresholds => ({
  minTrainingRows: ML_READINESS_THRESHOLDS.MIN_TRAINING_ROWS,
  minPositiveRows: ML_READINESS_THRESHOLDS.MIN_POSITIVE_ROWS,
  minNegativeRows: ML_READINESS_THRESHOLDS.MIN_NEGATIVE_ROWS,
  minCoreFeatureCoverage: ML_READINESS_THRESHOLDS.MIN_CORE_FEATURE_COVERAGE,
});

/** Operational gate, not a claim about model quality — thresholds are plain
 * constants (ml-data.constants.ts's ML_READINESS_THRESHOLDS), never
 * hardcoded here, so they can be tuned without touching this logic. The
 * numbers (200 / 40 / 40 / 60%) are unchanged by Readiness V2; only WHAT is
 * counted changed. */
@Injectable()
export class MlReadinessService {
  constructor(private readonly training: MlTrainingDataService) {}

  /** Readiness V2 — the version the training gate reads. */
  async forTarget(targetName: string, now: Date = new Date()): Promise<ReadinessReport> {
    const target = getTarget(targetName);
    if (!target) return unknownTarget(targetName, READINESS_VERSION);
    const world = await this.training.loadWorld();
    return this.v2(world, targetName, now);
  }

  v2(world: TrainingWorld, targetName: string, now: Date): ReadinessReport {
    const target = getTarget(targetName)!;
    const rows = this.training.evaluate(world, target, now, "V2", "ELIGIBLE");
    const t = this.training.tally(rows, target.valueType);
    const positive = target.valueType === "boolean" ? t.positive : t.numericAvailable;
    const negative = t.negative;
    const usableExamples = target.valueType === "boolean" ? t.positive + t.negative : t.numericAvailable;

    const eligibilityCounts = { eligible: 0, analysisOnly: 0, excluded: 0 };
    for (const s of world.snapshots) {
      const e = effectiveEligibility(s);
      if (e === TrainingEligibility.ELIGIBLE) eligibilityCounts.eligible++;
      else if (e === TrainingEligibility.EXCLUDED) eligibilityCounts.excluded++;
      else eligibilityCounts.analysisOnly++;
    }

    const trainingRows = rows.filter((r) => r.label.status === LabelStatus.AVAILABLE);
    const allEligibleTally = tallyCoverage(rows.map((r) => r.featureStates));
    const trainingTally = tallyCoverage(trainingRows.map((r) => r.featureStates));
    const basis = trainingRows.length ? trainingTally : allEligibleTally;

    const perFeature: FeatureCoverageDetail[] = ML_CORE_FEATURES.map((key) => {
      const d: FeatureCoverageDetail = { key, withValue: 0, applicableMissing: 0, unknown: 0, notApplicable: 0 };
      for (const r of (trainingRows.length ? trainingRows : rows)) {
        const s = r.featureStates[key];
        if (s === FeatureCoverageState.APPLICABLE_WITH_VALUE) d.withValue++;
        else if (s === FeatureCoverageState.APPLICABLE_MISSING) d.applicableMissing++;
        else if (s === FeatureCoverageState.NOT_APPLICABLE) d.notApplicable++;
        else d.unknown++;
      }
      return d;
    });

    const th = ML_READINESS_THRESHOLDS;
    const reasons: string[] = [];
    if (usableExamples < th.MIN_TRAINING_ROWS) reasons.push(`Need at least ${th.MIN_TRAINING_ROWS} mature, training-eligible examples with defensible labels (have ${usableExamples})`);
    if (target.valueType === "boolean") {
      if (positive < th.MIN_POSITIVE_ROWS) reasons.push(`Need at least ${th.MIN_POSITIVE_ROWS} positive examples (have ${positive})`);
      if (negative < th.MIN_NEGATIVE_ROWS) reasons.push(`Need at least ${th.MIN_NEGATIVE_ROWS} negative examples with attested outcome coverage (have ${negative})`);
    }
    if (basis.pct < th.MIN_CORE_FEATURE_COVERAGE) {
      reasons.push(`Core feature coverage below ${Math.round(th.MIN_CORE_FEATURE_COVERAGE * 100)}% (have ${Math.round(basis.pct * 100)}%, not-applicable features excluded)`);
    }
    const warnings: string[] = [];
    if (t.coverageUnattested > 0) warnings.push(`${t.coverageUnattested} eligible snapshot(s) have a matured window but no attested ${target.coverageType} coverage, so they cannot be labelled negative`);
    if (t.unverified > 0) warnings.push(`${t.unverified} eligible snapshot(s) carry an unverified shutdown event, so their survival label is withheld`);

    return {
      readinessVersion: READINESS_VERSION,
      ready: reasons.length === 0,
      target: target.name,
      usableExamples, positiveExamples: positive, negativeExamples: negative,
      featureCoverage: Math.round(basis.pct * 1000) / 1000,
      reasons, warnings,
      totalSnapshots: world.snapshots.length,
      trainingEligibleSnapshots: eligibilityCounts.eligible, analysisOnlySnapshots: eligibilityCounts.analysisOnly, excludedSnapshots: eligibilityCounts.excluded,
      unknownExamples: t.coverageUnattested, notMatured: t.notMatured, insufficientData: t.insufficientData, unverified: t.unverified, excludedByApplicability: t.excluded,
      featureCoverageAllEligible: Math.round(allEligibleTally.pct * 1000) / 1000,
      coverageCells: { covered: basis.covered, applicable: basis.applicable, notApplicable: basis.notApplicable },
      perFeature, thresholds: readinessThresholds(),
    };
  }

  /** Readiness V1, exactly as it was (every snapshot, silence = negative,
   * no applicability). Retained ONLY so the before/after comparison is
   * reproducible — it is never what the training gate reads. */
  async forTargetV1(targetName: string, now: Date = new Date()): Promise<ReadinessReport> {
    const target = getTarget(targetName);
    if (!target) return unknownTarget(targetName, 1);
    const world = await this.training.loadWorld();
    const rows = this.training.evaluate(world, target, now, "V1", "ALL");
    const t = this.training.tally(rows, target.valueType);
    const positive = target.valueType === "boolean" ? t.positive : t.numericAvailable;
    const usable = target.valueType === "boolean" ? t.positive + t.negative : t.numericAvailable;
    const cells = tallyCoverage(world.snapshots.map((s) => Object.fromEntries(ML_CORE_FEATURES.map((k) => [k, (s.features as Record<string, unknown>)[k] != null ? FeatureCoverageState.APPLICABLE_WITH_VALUE : FeatureCoverageState.UNKNOWN]))));
    const th = ML_READINESS_THRESHOLDS;
    const reasons: string[] = [];
    if (usable < th.MIN_TRAINING_ROWS) reasons.push(`Need at least ${th.MIN_TRAINING_ROWS} mature examples (have ${usable})`);
    if (target.valueType === "boolean") {
      if (positive < th.MIN_POSITIVE_ROWS) reasons.push(`Need at least ${th.MIN_POSITIVE_ROWS} positive examples (have ${positive})`);
      if (t.negative < th.MIN_NEGATIVE_ROWS) reasons.push(`Need at least ${th.MIN_NEGATIVE_ROWS} negative examples (have ${t.negative})`);
    }
    if (cells.pct < th.MIN_CORE_FEATURE_COVERAGE) reasons.push(`Core feature coverage below ${Math.round(th.MIN_CORE_FEATURE_COVERAGE * 100)}% (have ${Math.round(cells.pct * 100)}%)`);
    return { readinessVersion: 1, ready: reasons.length === 0, target: target.name, usableExamples: usable, positiveExamples: positive, negativeExamples: t.negative, featureCoverage: Math.round(cells.pct * 1000) / 1000, reasons, totalSnapshots: world.snapshots.length };
  }
}

function unknownTarget(targetName: string, version: number): ReadinessReport {
  return { readinessVersion: version, ready: false, target: targetName, usableExamples: 0, positiveExamples: 0, negativeExamples: 0, featureCoverage: 0, reasons: [`Unknown target "${targetName}"`] };
}
