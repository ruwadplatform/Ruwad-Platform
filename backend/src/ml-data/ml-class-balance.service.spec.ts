import { MlClassBalanceService } from "./ml-class-balance.service";
import { MlSnapshotSource, OutcomeCoverageType, OutcomeEventSource, SnapshotSelectionMethod, StartupOutcomeEventType, TrainingEligibility } from "../common/enums";
import { trainingService } from "./testing/training-fakes";

const NOW = new Date("2027-09-29T00:00:00.000Z");

const snap = (id: string, monthsAgo: number, over: Record<string, any> = {}) => {
  const snapshotAt = new Date(NOW); snapshotAt.setUTCMonth(snapshotAt.getUTCMonth() - monthsAgo);
  return {
    id, startupId: id, snapshotAt, scoreVersion: "v1", featureSchemaVersion: "v1", features: {}, provenanceSummary: {}, scoreStatus: "CALCULATED", startupStage: "Seed", category: "Digital Health",
    snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.ELIGIBLE, ...over,
  };
};
const funding = (startupId: string, over: Record<string, any> = {}) => ({ startupId, eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01", valueNumeric: 1, source: OutcomeEventSource.ADMIN_ENTERED, verified: true, ...over });
const fundingCoverage = (startupId: string, through = "2027-09-29") => ({ startupId, coverageType: OutcomeCoverageType.FUNDING, coverageThrough: through });

describe("MlClassBalanceService (V2)", () => {
  it("counts positive/negative/notMatured/unknown across a mixed set of eligible snapshots", async () => {
    const svc = new MlClassBalanceService(trainingService({
      snapshots: [
        snap("a", 13), // matured, FUNDING attested, no event -> negative
        snap("b", 13), // matured, has funding event -> positive
        snap("c", 3), // not matured yet
        snap("d", 13), // matured but NO attestation -> unknown, never negative
      ],
      events: [funding("b")],
      coverage: [fundingCoverage("a"), fundingCoverage("b"), fundingCoverage("c")],
    }));
    const report = await svc.forTarget("raisedNewRoundWithin12Months", NOW);
    expect(report.positive).toBe(1);
    expect(report.negative).toBe(1);
    expect(report.notMatured).toBe(1);
    expect(report.unknown).toBe(1);
    expect(report.snapshotsConsidered).toBe(4);
  });

  it("a numeric target's every AVAILABLE row counts as 'positive' (available), never negative", async () => {
    const svc = new MlClassBalanceService(trainingService({
      snapshots: [snap("a", 13, { features: { annualRevenue: 100 } })],
      events: [{ startupId: "a", eventType: StartupOutcomeEventType.REVENUE_UPDATE, eventDate: "2027-01-01", valueNumeric: 150, source: OutcomeEventSource.ADMIN_ENTERED, verified: true }],
      coverage: [{ startupId: "a", coverageType: OutcomeCoverageType.REVENUE, coverageThrough: "2027-09-29" }],
    }));
    const report = await svc.forTarget("revenueGrowth12Months", NOW);
    expect(report.positive).toBe(1);
    expect(report.negative).toBe(0);
  });

  it("by default ANALYSIS_ONLY (legacy outcome-aware) snapshots are not counted at all", async () => {
    const svc = new MlClassBalanceService(trainingService({
      snapshots: [snap("a", 13), snap("legacy", 13, { selectionMethod: SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE, trainingEligibility: TrainingEligibility.ANALYSIS_ONLY })],
      events: [funding("legacy")],
      coverage: [fundingCoverage("a"), fundingCoverage("legacy")],
    }));
    const report = await svc.forTarget("raisedNewRoundWithin12Months", NOW);
    expect(report.snapshotsConsidered).toBe(1);
    expect(report.positive).toBe(0);
  });

  it("V1 mode reproduces the original rule (all snapshots, silence is a negative) for before/after comparison", async () => {
    const svc = new MlClassBalanceService(trainingService({
      snapshots: [snap("a", 13), snap("legacy", 13, { selectionMethod: SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE, trainingEligibility: TrainingEligibility.ANALYSIS_ONLY })],
      events: [funding("legacy")],
    }));
    const v1 = await svc.forTarget("raisedNewRoundWithin12Months", NOW, "V1");
    expect(v1.snapshotsConsidered).toBe(2);
    expect(v1.positive).toBe(1);
    expect(v1.negative).toBe(1); // "a": no coverage at all, still a V1 negative
    const v2 = await svc.forTarget("raisedNewRoundWithin12Months", NOW);
    expect(v2.negative).toBe(0);
    expect(v2.unknown).toBe(1);
  });
});
