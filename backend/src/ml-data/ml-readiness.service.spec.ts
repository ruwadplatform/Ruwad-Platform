import { MlReadinessService, READINESS_VERSION } from "./ml-readiness.service";
import { ML_CORE_FEATURES, ML_READINESS_THRESHOLDS } from "./ml-data.constants";
import { FeatureApplicabilityStatus, MlSnapshotSource, OutcomeCoverageType, OutcomeEventSource, ScoreDataSource, SnapshotSelectionMethod, StartupOutcomeEventType, TrainingEligibility } from "../common/enums";
import { trainingService } from "./testing/training-fakes";

const NOW = new Date("2027-09-29T00:00:00.000Z");
const FULL = Object.fromEntries(ML_CORE_FEATURES.map((k) => [k, k === "regulatoryMilestone" ? "approval" : 1]));

let seq = 0;
const snap = (over: Record<string, any> = {}) => {
  seq++;
  return {
    id: `s${seq}`, startupId: `u${seq}`, snapshotAt: new Date("2025-12-31T00:00:00.000Z"), scoreVersion: "v1", featureSchemaVersion: "v1", features: {}, provenanceSummary: {}, scoreStatus: "X", startupStage: "Seed", category: "Digital Health",
    snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.ELIGIBLE, ...over,
  };
};
const funding = (startupId: string) => ({ startupId, eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2026-03-01", valueNumeric: 1, source: OutcomeEventSource.ADMIN_ENTERED, verified: true });
const cov = (startupId: string) => ({ startupId, coverageType: OutcomeCoverageType.FUNDING, coverageThrough: "2027-09-29" });

/** n eligible snapshots; the first `pos` get a funding event; every one has funding coverage. */
function dataset(n: number, pos: number, features: Record<string, unknown> = FULL) {
  seq = 0;
  const snapshots = Array.from({ length: n }, () => snap({ features }));
  return { snapshots, events: snapshots.slice(0, pos).map((s) => funding(s.startupId)), coverage: snapshots.map((s) => cov(s.startupId)) };
}

describe("MlReadinessService — Readiness V2", () => {
  it("is version 2, not ready, and states why when there isn't enough defensible data", async () => {
    const svc = new MlReadinessService(trainingService(dataset(10, 5)));
    const r = await svc.forTarget("raisedNewRoundWithin12Months", NOW);
    expect(r.readinessVersion).toBe(READINESS_VERSION);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => x.includes(String(ML_READINESS_THRESHOLDS.MIN_TRAINING_ROWS)))).toBe(true);
    expect(r.reasons.some((x) => x.includes(String(ML_READINESS_THRESHOLDS.MIN_POSITIVE_ROWS)))).toBe(true);
  });

  it("is ready when every unchanged threshold is met (200 usable, 40 positive, 40 negative, 60% coverage)", async () => {
    const svc = new MlReadinessService(trainingService(dataset(200, 100)));
    const r = await svc.forTarget("raisedNewRoundWithin12Months", NOW);
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.usableExamples).toBe(200);
    expect(r.positiveExamples).toBe(100);
    expect(r.negativeExamples).toBe(100);
  });

  it("the thresholds are unchanged", () => {
    expect(ML_READINESS_THRESHOLDS).toEqual({ MIN_TRAINING_ROWS: 200, MIN_POSITIVE_ROWS: 40, MIN_NEGATIVE_ROWS: 40, MIN_CORE_FEATURE_COVERAGE: 0.6 });
  });

  it("counts training-ELIGIBLE snapshots only: 200 rows of which 150 are legacy cannot pass", async () => {
    const d = dataset(200, 100);
    d.snapshots.slice(0, 150).forEach((s: any) => { s.selectionMethod = SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE; s.trainingEligibility = TrainingEligibility.ANALYSIS_ONLY; });
    const r = await new MlReadinessService(trainingService(d)).forTarget("raisedNewRoundWithin12Months", NOW);
    expect(r.ready).toBe(false);
    expect(r.trainingEligibleSnapshots).toBe(50);
    expect(r.analysisOnlySnapshots).toBe(150);
    expect(r.usableExamples).toBe(50);
  });

  it("a stored ELIGIBLE flag on a legacy snapshot is overridden: it still cannot be trained on", async () => {
    const d = dataset(1, 0);
    (d.snapshots[0] as any).selectionMethod = SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE; // flag still says ELIGIBLE
    const r = await new MlReadinessService(trainingService(d)).forTarget("raisedNewRoundWithin12Months", NOW);
    expect(r.trainingEligibleSnapshots).toBe(0);
    expect(r.analysisOnlySnapshots).toBe(1);
  });

  it("uses defensible labels only: negatives without attested coverage are 'unknown', not negative", async () => {
    const d = dataset(100, 50);
    d.coverage = []; // nothing attested
    const r = await new MlReadinessService(trainingService(d)).forTarget("raisedNewRoundWithin12Months", NOW);
    expect(r.positiveExamples).toBe(50); // genuine positives still count
    expect(r.negativeExamples).toBe(0);
    expect(r.unknownExamples).toBe(50);
    expect(r.warnings?.[0]).toMatch(/no attested FUNDING coverage/);
  });

  it("coverage is applicability-aware: NOT_APPLICABLE leaves the denominator (5/5 = 100%, not 5/6)", async () => {
    const { regulatoryMilestone, ...five } = FULL as Record<string, unknown>;
    void regulatoryMilestone;
    const d = dataset(1, 0, five);
    const applicability = [{ startupId: d.snapshots[0].startupId, featureKey: "regulatoryMilestone", status: FeatureApplicabilityStatus.NOT_APPLICABLE, effectiveDate: "2020-01-01", source: ScoreDataSource.ADMIN_ENTERED, verified: true }];
    const aware = await new MlReadinessService(trainingService({ ...d, applicability })).forTarget("raisedNewRoundWithin12Months", NOW);
    expect(aware.featureCoverage).toBe(1);
    expect(aware.coverageCells).toEqual({ covered: 5, applicable: 5, notApplicable: 1 });
    const unaware = await new MlReadinessService(trainingService(d)).forTarget("raisedNewRoundWithin12Months", NOW);
    expect(unaware.featureCoverage).toBeCloseTo(5 / 6, 3); // UNKNOWN stays in the denominator
  });

  it("returns a not-ready report for an unknown target rather than throwing", async () => {
    const r = await new MlReadinessService(trainingService()).forTarget("notARealTarget");
    expect(r.ready).toBe(false);
    expect(r.reasons[0]).toMatch(/Unknown target/);
  });

  it("V1 stays reproducible: every snapshot counts and silence is a negative", async () => {
    const d = dataset(10, 0);
    d.coverage = [];
    d.snapshots.slice(0, 5).forEach((s: any) => { s.selectionMethod = SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE; s.trainingEligibility = TrainingEligibility.ANALYSIS_ONLY; });
    const svc = new MlReadinessService(trainingService(d));
    const v1 = await svc.forTargetV1("raisedNewRoundWithin12Months", NOW);
    expect(v1.readinessVersion).toBe(1);
    expect(v1.negativeExamples).toBe(10);
    const v2 = await svc.forTarget("raisedNewRoundWithin12Months", NOW);
    expect(v2.negativeExamples).toBe(0);
  });
});
