import { MlCoverageService } from "./ml-coverage.service";
import { MlSnapshotSource, ScoreStatus, ScoreTrigger } from "../common/enums";

function fakeRepo(seed: Record<string, any>[] = []) {
  return { rows: seed, find: jest.fn(async () => seed) };
}

describe("MlCoverageService.report", () => {
  it("counts startups with 4+ factors and confidence tiers from the latest history row per startup", async () => {
    const startups = fakeRepo([
      { id: "s1", category: "Digital Health", stage: "Seed", founded: 2022, country: "Saudi Arabia", scoreConfidence: 0.6 },
      { id: "s2", category: "MedTech", stage: "Series A", founded: 2021, country: "UAE", scoreConfidence: 0.3 },
    ]);
    const history = fakeRepo([
      { startupId: "s1", calculatedAt: new Date("2026-01-01"), triggeredBy: ScoreTrigger.STARTUP_CREATED, status: ScoreStatus.CALCULATED, factors: { growth: { score: 5 }, financial: { score: 5 }, market: { score: 5 }, team: { score: 5 }, regulatory: { score: null }, technology: { score: null } } },
      { startupId: "s2", calculatedAt: new Date("2026-01-01"), triggeredBy: ScoreTrigger.STARTUP_CREATED, status: ScoreStatus.INSUFFICIENT_DATA, factors: { growth: { score: 5 }, financial: { score: null }, market: { score: null }, team: { score: null }, regulatory: { score: null }, technology: { score: null } } },
    ]);
    const snapshots = fakeRepo();
    const events = fakeRepo();
    const svc = new MlCoverageService(startups as any, history as any, snapshots as any, events as any);
    const report = await svc.report();
    expect(report.totalPublishedStartups).toBe(2);
    expect(report.with4PlusFactors).toBe(1); // only s1
    expect(report.with50PlusConfidence).toBe(1); // only s1 (0.6 >= 0.5)
    expect(report.with70PlusConfidence).toBe(0);
    expect(report.byCategory).toEqual(expect.arrayContaining([{ l: "Digital Health", v: 1 }, { l: "MedTech", v: 1 }]));
  });

  it("counts startups with a snapshot at least 12 months old as having complete 12-month history", async () => {
    const startups = fakeRepo([{ id: "s1", category: "x", stage: "x", founded: 2020, country: "x", scoreConfidence: null }]);
    const old = new Date(); old.setUTCFullYear(old.getUTCFullYear() - 2);
    const recent = new Date();
    const snapshots = fakeRepo([
      { startupId: "s1", snapshotAt: old, features: {}, provenanceSummary: {}, snapshotSource: MlSnapshotSource.MATERIAL_CHANGE, scoreStatus: "CALCULATED", startupStage: "x", category: "x", scoreVersion: "v1", featureSchemaVersion: "v1" },
      { startupId: "s1", snapshotAt: recent, features: {}, provenanceSummary: {}, snapshotSource: MlSnapshotSource.MATERIAL_CHANGE, scoreStatus: "CALCULATED", startupStage: "x", category: "x", scoreVersion: "v1", featureSchemaVersion: "v1" },
    ]);
    const svc = new MlCoverageService(startups as any, fakeRepo() as any, snapshots as any, fakeRepo() as any);
    const report = await svc.report();
    expect(report.withComplete12MonthHistory).toBe(1); // only the old one qualifies
  });
});
