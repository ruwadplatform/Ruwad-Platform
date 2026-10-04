import { LabelStatus, MlSnapshotSource, OutcomeCoverageType, OutcomeEventSource, StartupOutcomeEventType, SnapshotSelectionMethod, TrainingEligibility, FeatureApplicabilityStatus, ScoreDataSource } from "../../common/enums";
import { getTarget, TARGET_REGISTRY } from "./target-registry";
import { coverageLabelContext, coverageSupportsNegative, effectiveCoverage, LEGACY_LABEL_CONTEXT } from "./outcome-coverage";
import { windowedEventBooleanLabel, windowedSumLabel, survivalLabel } from "./calculators";
import { trainingService } from "../testing/training-fakes";
import type { StartupMlFeatureSnapshot } from "../startup-ml-feature-snapshot.entity";
import type { StartupOutcomeEvent } from "../outcome-event.entity";

const F = OutcomeCoverageType;
const snapshotAt = new Date("2024-12-31T00:00:00.000Z"); // 12-month window ends 2025-12-31
const NOW = new Date("2026-10-03T00:00:00.000Z"); // every window up to 24m... (24m ends 2026-12-31) is NOT matured; 6/12m are
const snapshot = (over: Record<string, any> = {}) => ({
  id: "s", startupId: "u1", snapshotAt, features: {}, provenanceSummary: {}, category: "MedTech", startupStage: "Seed", snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, ...over,
}) as unknown as StartupMlFeatureSnapshot;
const ev = (eventType: StartupOutcomeEventType, eventDate: string, over: Record<string, any> = {}) => ({ id: `e-${eventDate}`, startupId: "u1", eventType, eventDate, source: OutcomeEventSource.ADMIN_ENTERED, verified: true, ...over }) as unknown as StartupOutcomeEvent;
const ctxWith = (family: OutcomeCoverageType, through: string) => coverageLabelContext({ [family]: through });

describe("coverageSupportsNegative — snapshotDate + window <= coverageThrough", () => {
  it("is true only when coverage reaches the window's end", () => {
    expect(coverageSupportsNegative({ through: "2025-12-31" }, snapshotAt, 12)).toBe(true);
    expect(coverageSupportsNegative({ through: "2026-06-01" }, snapshotAt, 12)).toBe(true);
    expect(coverageSupportsNegative({ through: "2025-12-30" }, snapshotAt, 12)).toBe(false);
    expect(coverageSupportsNegative({ through: undefined }, snapshotAt, 12)).toBe(false);
  });
  it("legacy mode (no gate) never withholds", () => expect(coverageSupportsNegative(undefined, snapshotAt, 12)).toBe(true));
});

describe("negative labels need matured window + target-specific coverage + no qualifying event", () => {
  const t = getTarget("raisedNewRoundWithin12Months")!;

  it("incomplete coverage -> COVERAGE_UNATTESTED (never a negative)", () => {
    expect(t.calculate(snapshot(), [], NOW, ctxWith(F.FUNDING, "2025-06-30")).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
    expect(t.calculate(snapshot(), [], NOW, coverageLabelContext({})).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
  });
  it("coverage through the window end -> a real negative", () => {
    const r = t.calculate(snapshot(), [], NOW, ctxWith(F.FUNDING, "2025-12-31"));
    expect(r).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: false });
  });
  it("coverage cannot mature a window that has not elapsed", () => {
    const r = t.calculate(snapshot({ snapshotAt: new Date("2026-06-30T00:00:00Z") }), [], NOW, ctxWith(F.FUNDING, "2026-10-01"));
    expect(r.status).toBe(LabelStatus.NOT_MATURED);
  });
  it("a qualifying event in the window makes it positive even with NO coverage attestation", () => {
    const r = t.calculate(snapshot(), [ev(StartupOutcomeEventType.FUNDING_ROUND, "2025-03-01")], NOW, coverageLabelContext({}));
    expect(r).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: true });
  });
  it("a qualifying event positive is recognised before the window has even elapsed", () => {
    const r = t.calculate(snapshot({ snapshotAt: new Date("2026-06-30T00:00:00Z") }), [ev(StartupOutcomeEventType.FUNDING_ROUND, "2026-08-01")], NOW, coverageLabelContext({}));
    expect(r.valueBoolean).toBe(true);
  });
  it("legacy context is unchanged: silence after the window is a negative", () => {
    expect(t.calculate(snapshot(), [], NOW, LEGACY_LABEL_CONTEXT)).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: false });
  });
});

describe("the wrong outcome family can never mature another target", () => {
  const everything = Object.values(F).map((f) => [f, "2026-10-01"] as const);
  const allFamiliesExcept = (skip: OutcomeCoverageType) => coverageLabelContext(Object.fromEntries(everything.filter(([f]) => f !== skip)) as any);
  const onlyFamily = (only: OutcomeCoverageType) => coverageLabelContext({ [only]: "2026-10-01" });

  it("every target declares exactly one coverage family", () => {
    for (const t of TARGET_REGISTRY) expect(Object.values(F)).toContain(t.coverageType);
  });
  it("FUNDING coverage does not give a regulatory negative", () => {
    const t = getTarget("regulatoryMilestoneAdvancedWithin12Months")!;
    expect(t.calculate(snapshot(), [], NOW, onlyFamily(F.FUNDING)).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
    expect(t.calculate(snapshot(), [], NOW, onlyFamily(F.REGULATORY)).valueBoolean).toBe(false);
  });
  it("FUNDING coverage does not give a survival, market-entry, commercial-launch or partnership negative", () => {
    for (const [name, family] of [["activeAfter12Months", F.SURVIVAL], ["enteredNewCountryWithin12Months", F.MARKET_ENTRY], ["launchedCommerciallyWithin12Months", F.COMMERCIALIZATION], ["signedCommercialPartnershipWithin12Months", F.PARTNERSHIP]] as const) {
      const t = getTarget(name)!;
      expect(t.coverageType).toBe(family);
      expect(t.calculate(snapshot(), [], NOW, onlyFamily(F.FUNDING)).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
      expect(t.calculate(snapshot(), [], NOW, onlyFamily(family)).status).toBe(LabelStatus.AVAILABLE);
    }
  });
  it("COMMERCIALIZATION coverage does not cover a partnership target, and vice versa", () => {
    expect(getTarget("signedCommercialPartnershipWithin12Months")!.calculate(snapshot(), [], NOW, onlyFamily(F.COMMERCIALIZATION)).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
    expect(getTarget("launchedCommerciallyWithin12Months")!.calculate(snapshot(), [], NOW, onlyFamily(F.PARTNERSHIP)).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
  });
  it("coverage of every OTHER family still leaves a funding negative unattested", () => {
    expect(getTarget("raisedNewRoundWithin12Months")!.calculate(snapshot(), [], NOW, allFamiliesExcept(F.FUNDING)).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
  });
});

describe("numeric and survival calculators", () => {
  const funding = (d: string, n: number) => ev(StartupOutcomeEventType.FUNDING_ROUND, d, { valueNumeric: n });
  it("a funding total (even zero) needs coverage through the window", () => {
    expect(windowedSumLabel(snapshotAt, [], 12, () => true, NOW, { through: undefined }).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
    expect(windowedSumLabel(snapshotAt, [funding("2025-02-01", 5)], 12, (e) => e.eventType === StartupOutcomeEventType.FUNDING_ROUND, NOW, { through: "2025-12-31" })).toEqual({ status: LabelStatus.AVAILABLE, valueNumeric: 5 });
  });
  it("a confirmed (verified) dated shutdown is the only thing that produces a survival negative", () => {
    const r = survivalLabel(snapshotAt, [ev(StartupOutcomeEventType.SHUTDOWN, "2025-05-01", { verified: true })], 12, NOW, { through: undefined });
    expect(r).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: false });
  });
  it("a status-only / unverified shutdown (the Sihatech pattern) cannot create a defensible survival label either way", () => {
    const r = survivalLabel(snapshotAt, [ev(StartupOutcomeEventType.SHUTDOWN, "2025-05-01", { verified: false })], 12, NOW, { through: "2026-09-30" });
    expect(r.status).toBe(LabelStatus.UNVERIFIED);
    expect(r.valueBoolean).toBeUndefined();
  });
  it("'still active' needs SURVIVAL coverage; silence alone is not survival", () => {
    expect(survivalLabel(snapshotAt, [], 12, NOW, { through: undefined }).status).toBe(LabelStatus.COVERAGE_UNATTESTED);
    expect(survivalLabel(snapshotAt, [], 12, NOW, { through: "2025-12-31" })).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: true });
  });
  it("legacy survival is untouched (reproducibility of the old numbers)", () => {
    expect(survivalLabel(snapshotAt, [ev(StartupOutcomeEventType.SHUTDOWN, "2025-05-01", { verified: false })], 12, NOW)).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: false });
  });
  it("a boolean calculator without a gate behaves exactly as before", () => {
    expect(windowedEventBooleanLabel(snapshotAt, [], 12, () => true, NOW)).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: false });
  });
});

describe("effectiveCoverage", () => {
  it("takes the latest non-revoked date per family and ignores revoked rows", () => {
    const m = effectiveCoverage([
      { coverageType: F.FUNDING, coverageThrough: "2025-01-01" },
      { coverageType: F.FUNDING, coverageThrough: "2026-01-01" },
      { coverageType: F.FUNDING, coverageThrough: "2026-09-01", revokedAt: new Date() },
      { coverageType: F.SURVIVAL, coverageThrough: "2024-01-01" },
    ]);
    expect(m).toEqual({ FUNDING: "2026-01-01", SURVIVAL: "2024-01-01" });
  });
});

describe("applicability at the target level", () => {
  const grid = (over: Record<string, any> = {}) => ({
    id: "g", startupId: "u1", snapshotAt, features: {}, provenanceSummary: {}, category: "Digital Health", startupStage: "Seed",
    snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.ELIGIBLE, ...over,
  });
  const na = { startupId: "u1", featureKey: "regulatoryMilestone", status: FeatureApplicabilityStatus.NOT_APPLICABLE, effectiveDate: "2020-01-01", source: ScoreDataSource.ADMIN_ENTERED, verified: true };

  it("a startup that declared the regulatory pathway NOT_APPLICABLE is EXCLUDED from the regulatory target, not counted as a negative", async () => {
    const svc = trainingService({ snapshots: [grid()], coverage: [{ startupId: "u1", coverageType: F.REGULATORY, coverageThrough: "2026-10-01" }], applicability: [na] });
    const world = await svc.loadWorld();
    const [row] = svc.evaluate(world, getTarget("regulatoryMilestoneAdvancedWithin12Months")!, NOW, "V2", "ELIGIBLE");
    expect(row.label.status).toBe(LabelStatus.EXCLUDED);
    // ...whereas without the declaration the same snapshot is a defensible negative
    const svc2 = trainingService({ snapshots: [grid()], coverage: [{ startupId: "u1", coverageType: F.REGULATORY, coverageThrough: "2026-10-01" }] });
    const [row2] = svc2.evaluate(await svc2.loadWorld(), getTarget("regulatoryMilestoneAdvancedWithin12Months")!, NOW, "V2", "ELIGIBLE");
    expect(row2.label).toEqual({ status: LabelStatus.AVAILABLE, valueBoolean: false });
  });
  it("revoked coverage no longer supports a negative", async () => {
    const svc = trainingService({ snapshots: [grid()], coverage: [{ startupId: "u1", coverageType: F.FUNDING, coverageThrough: "2026-10-01", revokedAt: new Date() }] });
    const [row] = svc.evaluate(await svc.loadWorld(), getTarget("raisedNewRoundWithin12Months")!, NOW, "V2", "ELIGIBLE");
    expect(row.label.status).toBe(LabelStatus.COVERAGE_UNATTESTED);
  });
});
