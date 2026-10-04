import { FeatureApplicabilityStatus as A, FeatureCoverageState as S, MlSnapshotSource, ScoreDataSource, SnapshotSelectionMethod, TrainingEligibility } from "../common/enums";
import { coverageStateFor, resolveApplicability, snapshotFeatureStates, tallyCoverage, ApplicabilityRow } from "./feature-applicability";
import { defaultEligibilityFor, effectiveEligibility, methodMayBeEligible } from "./training-eligibility";
import { ML_CORE_FEATURES } from "./ml-data.constants";

const row = (over: Partial<ApplicabilityRow> = {}): ApplicabilityRow => ({ featureKey: "regulatoryMilestone", status: A.NOT_APPLICABLE, effectiveDate: "2022-01-01", source: ScoreDataSource.ADMIN_ENTERED, verified: false, ...over });
const FIVE = { annualRevenue: 1, customerCount: 1, fundingRounds: 1, founderExperienceYears: 1, teamSize: 1 };

describe("feature applicability — MISSING, UNKNOWN and NOT_APPLICABLE are three different things", () => {
  it("no declaration at all is UNKNOWN, never NOT_APPLICABLE (missing data does not imply not-applicable)", () => {
    expect(resolveApplicability([], "regulatoryMilestone", "2024-12-31")).toBe(A.UNKNOWN);
    expect(coverageStateFor(false, A.UNKNOWN)).toBe(S.UNKNOWN);
  });
  it("a declared-applicable feature without a value is APPLICABLE_MISSING; with a value it is APPLICABLE_WITH_VALUE", () => {
    expect(coverageStateFor(false, A.APPLICABLE)).toBe(S.APPLICABLE_MISSING);
    expect(coverageStateFor(true, A.APPLICABLE)).toBe(S.APPLICABLE_WITH_VALUE);
  });
  it("an explicit NOT_APPLICABLE with no value is NOT_APPLICABLE", () => expect(coverageStateFor(false, A.NOT_APPLICABLE)).toBe(S.NOT_APPLICABLE));
  it("a present value always wins over a NOT_APPLICABLE declaration (a feature with a value is applicable)", () => {
    expect(coverageStateFor(true, A.NOT_APPLICABLE)).toBe(S.APPLICABLE_WITH_VALUE);
  });
  it("a declaration for another feature never leaks across features", () => {
    expect(resolveApplicability([row({ featureKey: "annualRevenue" })], "regulatoryMilestone", "2024-12-31")).toBe(A.UNKNOWN);
  });
});

describe("resolveApplicability — dated, leakage-safe, provenance-ranked", () => {
  it("a declaration effective AFTER the snapshot does not apply to it", () => {
    expect(resolveApplicability([row({ effectiveDate: "2025-06-01" })], "regulatoryMilestone", "2024-12-31")).toBe(A.UNKNOWN);
    expect(resolveApplicability([row({ effectiveDate: "2025-06-01" })], "regulatoryMilestone", "2025-06-01")).toBe(A.NOT_APPLICABLE);
  });
  it("the latest declaration on or before the snapshot wins", () => {
    const rows = [row({ effectiveDate: "2021-01-01", status: A.NOT_APPLICABLE }), row({ effectiveDate: "2023-01-01", status: A.APPLICABLE })];
    expect(resolveApplicability(rows, "regulatoryMilestone", "2022-12-31")).toBe(A.NOT_APPLICABLE);
    expect(resolveApplicability(rows, "regulatoryMilestone", "2023-12-31")).toBe(A.APPLICABLE);
  });
  it("a revoked declaration is ignored", () => {
    expect(resolveApplicability([row({ revokedAt: new Date() })], "regulatoryMilestone", "2024-12-31")).toBe(A.UNKNOWN);
  });
  it("same date: the stronger existing provenance (SOURCE_RANK) wins", () => {
    const rows = [row({ status: A.APPLICABLE, source: ScoreDataSource.EXTERNAL_SOURCE }), row({ status: A.NOT_APPLICABLE, source: ScoreDataSource.VERIFIED_DOCUMENT })];
    expect(resolveApplicability(rows, "regulatoryMilestone", "2024-12-31")).toBe(A.NOT_APPLICABLE);
  });
  it("same date, same rank, disagreeing: a conflict is UNKNOWN, never guessed", () => {
    const rows = [row({ status: A.APPLICABLE }), row({ status: A.NOT_APPLICABLE })];
    expect(resolveApplicability(rows, "regulatoryMilestone", "2024-12-31")).toBe(A.UNKNOWN);
  });
});

describe("applicability-aware coverage", () => {
  const states = (features: Record<string, unknown>, rows: ApplicabilityRow[] = []) => snapshotFeatureStates(features, rows, "2024-12-31");

  it("5 of 5 applicable features = 100%, not 5/6", () => {
    const t = tallyCoverage([states(FIVE, [row()])]);
    expect(t).toMatchObject({ covered: 5, applicable: 5, notApplicable: 1, pct: 1 });
  });
  it("the same snapshot with NO declaration stays at 5/6", () => {
    const t = tallyCoverage([states(FIVE)]);
    expect(t.pct).toBeCloseTo(5 / 6, 5);
    expect(t.notApplicable).toBe(0);
  });
  it("APPLICABLE_MISSING and UNKNOWN both stay in the denominator", () => {
    const t = tallyCoverage([states(FIVE, [row({ status: A.APPLICABLE })]), states(FIVE, [row({ status: A.UNKNOWN })])]);
    expect(t).toMatchObject({ covered: 10, applicable: 12, notApplicable: 0 });
  });
  it("with no NOT_APPLICABLE cells the figure equals the V1 formula exactly (present cells / snapshots x 6)", () => {
    const snaps = [FIVE, { annualRevenue: 1 }, {}];
    const present = snaps.reduce((a, f) => a + ML_CORE_FEATURES.filter((k) => (f as Record<string, unknown>)[k] != null).length, 0);
    expect(tallyCoverage(snaps.map((f) => states(f))).pct).toBeCloseTo(present / (snaps.length * 6), 10);
  });
  it("each NOT_APPLICABLE cell leaves only ITS OWN snapshot's denominator", () => {
    const t = tallyCoverage([states(FIVE, [row()]), states(FIVE)]); // 5/5 + 5/6
    expect(t).toMatchObject({ covered: 10, applicable: 11, notApplicable: 1 });
  });
  it("a snapshot whose every feature is NOT_APPLICABLE contributes nothing and cannot divide by zero", () => {
    const all = ML_CORE_FEATURES.map((k) => row({ featureKey: k }));
    expect(tallyCoverage([states({}, all)])).toMatchObject({ applicable: 0, pct: 0 });
  });
  it("applicability is evaluated as of each snapshot's own date", () => {
    const rows = [row({ effectiveDate: "2024-01-01" })];
    const early = snapshotFeatureStates(FIVE, rows, "2023-12-31");
    const late = snapshotFeatureStates(FIVE, rows, "2024-12-31");
    expect(early.regulatoryMilestone).toBe(S.UNKNOWN);
    expect(late.regulatoryMilestone).toBe(S.NOT_APPLICABLE);
  });
});

describe("training eligibility", () => {
  it("LEGACY_OUTCOME_AWARE -> ANALYSIS_ONLY; FIXED_CALENDAR_GRID and other predeclared -> ELIGIBLE; undeclared -> ANALYSIS_ONLY", () => {
    expect(defaultEligibilityFor(SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE)).toBe(TrainingEligibility.ANALYSIS_ONLY);
    expect(defaultEligibilityFor(SnapshotSelectionMethod.FIXED_CALENDAR_GRID)).toBe(TrainingEligibility.ELIGIBLE);
    expect(defaultEligibilityFor(SnapshotSelectionMethod.OTHER_PREDECLARED)).toBe(TrainingEligibility.ELIGIBLE);
    expect(defaultEligibilityFor(undefined)).toBe(TrainingEligibility.ANALYSIS_ONLY);
    expect(defaultEligibilityFor(null)).toBe(TrainingEligibility.ANALYSIS_ONLY);
    expect(methodMayBeEligible(SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE)).toBe(false);
  });
  it("a stored ELIGIBLE flag cannot rescue an outcome-aware or undeclared snapshot", () => {
    expect(effectiveEligibility({ selectionMethod: SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE, trainingEligibility: TrainingEligibility.ELIGIBLE })).toBe(TrainingEligibility.ANALYSIS_ONLY);
    expect(effectiveEligibility({ selectionMethod: null, trainingEligibility: TrainingEligibility.ELIGIBLE })).toBe(TrainingEligibility.ANALYSIS_ONLY);
  });
  it("EXCLUDED always stands; an eligible grid snapshot stays eligible", () => {
    expect(effectiveEligibility({ selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.EXCLUDED })).toBe(TrainingEligibility.EXCLUDED);
    expect(effectiveEligibility({ selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.ELIGIBLE })).toBe(TrainingEligibility.ELIGIBLE);
  });
  it("source is irrelevant to eligibility (only the selection method counts)", () => {
    void MlSnapshotSource;
    expect(effectiveEligibility({ selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.ELIGIBLE })).toBe(TrainingEligibility.ELIGIBLE);
  });
});
