import { MlDataQualityService } from "./ml-data-quality.service";
import { OutcomeEventSource, StartupOutcomeEventType } from "../common/enums";

function fakeRepo(seed: Record<string, any>[] = []) {
  return { rows: seed, find: jest.fn(async () => seed) };
}

describe("MlDataQualityService.featureCoverage", () => {
  it("computes non-null coverage, unique count and verified% per feature", async () => {
    const snapshots = fakeRepo([
      { features: { annualRevenue: 1_000_000, teamSize: 5 }, provenanceSummary: { annualRevenue: { verified: true }, teamSize: { verified: false } } },
      { features: { annualRevenue: 2_000_000 }, provenanceSummary: { annualRevenue: { verified: false } } },
      { features: {}, provenanceSummary: {} },
    ]);
    const events = fakeRepo();
    const svc = new MlDataQualityService(snapshots as any, events as any);
    const stats = await svc.featureCoverage();
    const revenue = stats.find((s) => s.key === "annualRevenue")!;
    expect(revenue.rowCount).toBe(3);
    expect(revenue.nonNullCount).toBe(2);
    expect(revenue.missingPct).toBeCloseTo(33.3, 1);
    expect(revenue.verifiedPct).toBeCloseTo(50, 5); // 1 of 2 present values verified
    expect(revenue.min).toBe(1_000_000);
    expect(revenue.max).toBe(2_000_000);
    expect(revenue.mean).toBe(1_500_000);

    const teamSize = stats.find((s) => s.key === "teamSize")!;
    expect(teamSize.nonNullCount).toBe(1);
    expect(teamSize.verifiedPct).toBe(0);
  });

  it("treats regulatoryMilestone as categorical with a value distribution, not min/max/mean", () => {
    const snapshots = fakeRepo([
      { features: { regulatoryMilestone: "strategy prepared" }, provenanceSummary: {} },
      { features: { regulatoryMilestone: "strategy prepared" }, provenanceSummary: {} },
      { features: { regulatoryMilestone: "SFDA submission" }, provenanceSummary: {} },
    ]);
    const svc = new MlDataQualityService(snapshots as any, fakeRepo() as any);
    return svc.featureCoverage().then((stats) => {
      const reg = stats.find((s) => s.key === "regulatoryMilestone")!;
      expect(reg.isCategorical).toBe(true);
      expect(reg.min).toBeUndefined();
      expect(reg.categoryDistribution).toEqual([{ value: "strategy prepared", count: 2 }, { value: "SFDA submission", count: 1 }]);
    });
  });
});

describe("MlDataQualityService.dataQualityIssues", () => {
  it("flags an impossible negative value for a count-shaped feature", async () => {
    const snapshots = fakeRepo([{ startupId: "s1", id: "sn1", features: { customerCount: -5 }, provenanceSummary: {} }]);
    const svc = new MlDataQualityService(snapshots as any, fakeRepo() as any);
    const issues = await svc.dataQualityIssues();
    expect(issues.some((i) => i.kind === "IMPOSSIBLE_NEGATIVE" && i.detail.includes("customerCount"))).toBe(true);
  });

  it("flags a NaN feature value", async () => {
    const snapshots = fakeRepo([{ startupId: "s1", id: "sn1", features: { marketGrowthRate: NaN }, provenanceSummary: {} }]);
    const svc = new MlDataQualityService(snapshots as any, fakeRepo() as any);
    const issues = await svc.dataQualityIssues();
    expect(issues.some((i) => i.kind === "NAN_VALUE")).toBe(true);
  });

  it("flags a future-dated outcome event", async () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5).toISOString().slice(0, 10);
    const events = fakeRepo([{ startupId: "s1", eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: farFuture, source: OutcomeEventSource.ADMIN_ENTERED }]);
    const svc = new MlDataQualityService(fakeRepo() as any, events as any);
    const issues = await svc.dataQualityIssues();
    expect(issues.some((i) => i.kind === "FUTURE_DATED_EVENT")).toBe(true);
  });

  it("flags duplicate snapshots (identical features for the same startup)", async () => {
    const snapshots = fakeRepo([
      { startupId: "s1", id: "a", features: { teamSize: 5 }, provenanceSummary: {} },
      { startupId: "s1", id: "b", features: { teamSize: 5 }, provenanceSummary: {} },
    ]);
    const svc = new MlDataQualityService(snapshots as any, fakeRepo() as any);
    const issues = await svc.dataQualityIssues();
    expect(issues.some((i) => i.kind === "DUPLICATE_SNAPSHOT")).toBe(true);
  });

  it("reports no issues for clean data", async () => {
    const snapshots = fakeRepo([{ startupId: "s1", id: "a", features: { teamSize: 5, annualRevenue: 100 }, provenanceSummary: {} }]);
    const events = fakeRepo([{ startupId: "s1", eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2020-01-01", valueNumeric: 100, source: OutcomeEventSource.ADMIN_ENTERED }]);
    const svc = new MlDataQualityService(snapshots as any, events as any);
    expect(await svc.dataQualityIssues()).toEqual([]);
  });
});
