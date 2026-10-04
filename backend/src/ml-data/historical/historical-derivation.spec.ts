import { EvidenceStatus, HistoricalEvidenceSourceType, MlSnapshotSource, OutcomeCoverageType, ScoreDataSource, SnapshotSelectionMethod, TrainingEligibility } from "../../common/enums";
import { customerSeries, deriveFounderFeatures, deriveFundingFeatures } from "./historical-derivation";
import { HistoricalSnapshotBuilder } from "./historical-snapshot-builder.service";
import { MlSnapshotService } from "../ml-snapshot.service";
import { memoryRepo } from "../testing/training-fakes";

describe("deriveFounderFeatures — as of each snapshot, strongest founder", () => {
  const careers = [{ careerStartYear: 2012, domainStartYear: 2015, verified: true }, { careerStartYear: 2018, verified: false }];
  it("uses the maximum across founders (existing methodology), computed from the snapshot year", () => {
    expect(deriveFounderFeatures(careers, "2024-12-31")).toMatchObject({ founderExperienceYears: 12, healthcareExperienceYears: 9, verified: true });
    expect(deriveFounderFeatures(careers, "2019-06-30").founderExperienceYears).toBe(7);
  });
  it("a career that starts after the snapshot year is future information and contributes nothing", () => {
    expect(deriveFounderFeatures(careers, "2011-12-31")).toMatchObject({ founderExperienceYears: undefined, healthcareExperienceYears: undefined });
    expect(deriveFounderFeatures([{ careerStartYear: 2018, verified: true }], "2015-12-31").founderExperienceYears).toBeUndefined();
  });
  it("the same founder yields different numbers at different snapshots (not one frozen 'years' value)", () => {
    const a = deriveFounderFeatures([{ careerStartYear: 2010, verified: true }], "2020-12-31").founderExperienceYears;
    const b = deriveFounderFeatures([{ careerStartYear: 2010, verified: true }], "2023-12-31").founderExperienceYears;
    expect([a, b]).toEqual([10, 13]);
  });
  it("revoked anchors are ignored; verified is false when the winning founder is unverified", () => {
    expect(deriveFounderFeatures([{ careerStartYear: 2000, verified: true, revokedAt: new Date() }], "2024-12-31").founderExperienceYears).toBeUndefined();
    expect(deriveFounderFeatures([{ careerStartYear: 2000, verified: false }], "2024-12-31").verified).toBe(false);
  });
});

describe("deriveFundingFeatures — only where funding coverage was attested", () => {
  const events = [{ eventDate: "2022-03-01", valueNumeric: 1_000_000 }, { eventDate: "2024-03-01", valueNumeric: 3_000_000 }];
  it("without attested coverage through the snapshot date, nothing is derived (a count would only be a lower bound)", () => {
    expect(deriveFundingFeatures(events, undefined, "2024-12-31")).toEqual({});
    expect(deriveFundingFeatures(events, "2023-12-31", "2024-12-31")).toEqual({});
  });
  it("with coverage it counts only events on or before the snapshot", () => {
    expect(deriveFundingFeatures(events, "2026-06-30", "2023-12-31")).toEqual({ fundingRounds: 1, totalFundingRaised: 1_000_000 });
    expect(deriveFundingFeatures(events, "2026-06-30", "2024-12-31")).toEqual({ fundingRounds: 2, totalFundingRaised: 4_000_000 });
  });
  it("a complete, empty history is a real zero; a missing amount means no total", () => {
    expect(deriveFundingFeatures([], "2026-06-30", "2021-12-31")).toEqual({ fundingRounds: 0, totalFundingRaised: 0 });
    expect(deriveFundingFeatures([{ eventDate: "2022-01-01", valueNumeric: null }], "2026-06-30", "2022-12-31")).toEqual({ fundingRounds: 1 });
  });
});

describe("customerSeries — incompatible metric types are never one series", () => {
  const r = (effectiveDate: string, valueText?: string) => ({ effectiveDate, valueText, status: EvidenceStatus.NO_CONFLICT });
  it("the series type is the earliest usable row's type as of the snapshot; other types are ignored", () => {
    const rows = [r("2022-12-31", "PATIENTS"), r("2023-12-31", "CLINICS"), r("2024-12-31", "PATIENTS")];
    expect(customerSeries(rows, "2024-12-31").map((x) => x.valueText)).toEqual(["PATIENTS", "PATIENTS"]);
  });
  it("later rows cannot change what an earlier snapshot's series means", () => {
    const rows = [r("2023-12-31", "CLINICS"), r("2022-12-31", "PATIENTS")];
    expect(customerSeries(rows, "2022-12-31").map((x) => x.valueText)).toEqual(["PATIENTS"]);
    expect(customerSeries(rows, "2023-12-31").map((x) => x.valueText)).toEqual(["PATIENTS"]);
  });
});

describe("HistoricalSnapshotBuilder — first-party evidence, leakage, provenance, applicability", () => {
  const S = "11111111-1111-4111-8111-111111111111";
  const ev = (over: Record<string, unknown>) => ({ id: `e${Math.random()}`, startupId: S, status: EvidenceStatus.NO_CONFLICT, reliability: "HIGH", verified: true, sourceType: HistoricalEvidenceSourceType.ADMIN_ENTERED, ...over });
  function build(evidenceRows: any[], context: Record<string, unknown> = {}) {
    const startups = memoryRepo([{ id: S, name: "Acme", stage: "Seed", category: "MedTech", scoreVersion: "RUWAD-2.0" }]);
    const snapshotRows = memoryRepo();
    const createHistoricalSnapshot = jest.fn(async (...a: any[]) => ({ id: "snap-1", features: a[1], provenance: a[2] }));
    const ctx = { load: async () => ({ careers: [], applicability: [], fundingEvents: [], coverage: {}, ...context }) };
    const builder = new HistoricalSnapshotBuilder(memoryRepo(evidenceRows) as any, startups as any, snapshotRows as any, { createHistoricalSnapshot } as any, ctx as any);
    return { builder, createHistoricalSnapshot };
  }

  it("evidence effective after the snapshot never reaches an earlier snapshot, and a later snapshot sees it", async () => {
    const { builder } = build([ev({ fieldKey: "annualRevenue", valueNumeric: 800_000, effectiveDate: "2022-12-31" }), ev({ fieldKey: "annualRevenue", valueNumeric: 1_600_000, effectiveDate: "2023-12-31" })]);
    expect((await builder.preview(S, "2022-12-31")).features.annualRevenue).toBe(800_000);
    expect((await builder.preview(S, "2023-06-30")).features.annualRevenue).toBe(800_000);
    expect((await builder.preview(S, "2023-12-31")).features.annualRevenue).toBe(1_600_000);
  });
  it("provenance is preserved per feature: source type and verified flag come from the winning evidence row", async () => {
    const { builder, createHistoricalSnapshot } = build([
      ev({ fieldKey: "annualRevenue", valueNumeric: 1, effectiveDate: "2023-01-01", sourceType: HistoricalEvidenceSourceType.VERIFIED_DOCUMENT, verified: true }),
      ev({ fieldKey: "teamSize", valueNumeric: 9, effectiveDate: "2023-01-01", sourceType: HistoricalEvidenceSourceType.LICENSED_DATABASE, verified: false }),
    ]);
    await builder.build(S, "2023-06-30", "test", { selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID });
    const prov = createHistoricalSnapshot.mock.calls[0][2];
    expect(prov.annualRevenue).toMatchObject({ source: ScoreDataSource.VERIFIED_DOCUMENT, verified: true });
    expect(prov.teamSize).toMatchObject({ source: ScoreDataSource.EXTERNAL_SOURCE, verified: false });
  });
  it("founder experience is derived as of the snapshot from career anchors, labelled SYSTEM_DERIVED, never from the future", async () => {
    const { builder } = build([], { careers: [{ careerStartYear: 2012, verified: true }] });
    const early = await builder.preview(S, "2011-12-31");
    expect(early.features.founderExperienceYears).toBeUndefined();
    const late = await builder.preview(S, "2024-12-31");
    expect(late.features.founderExperienceYears).toBe(12);
    expect(late.derivedFeatures).toContain("founderExperienceYears");
    expect(late.provenance.founderExperienceYears).toMatchObject({ source: ScoreDataSource.SYSTEM_DERIVED, verified: true });
  });
  it("direct evidence beats a derived value", async () => {
    const { builder } = build([ev({ fieldKey: "founderExperienceYears", valueNumeric: 20, effectiveDate: "2023-01-01" })], { careers: [{ careerStartYear: 2012, verified: true }] });
    const p = await builder.preview(S, "2024-12-31");
    expect(p.features.founderExperienceYears).toBe(20);
    expect(p.derivedFeatures).not.toContain("founderExperienceYears");
  });
  it("funding counts are derived only when FUNDING coverage reaches the snapshot date", async () => {
    const fundingEvents = [{ eventDate: "2022-03-01", valueNumeric: 1_000_000 }];
    const without = await build([], { fundingEvents }).builder.preview(S, "2023-12-31");
    expect(without.features.fundingRounds).toBeUndefined();
    const withCov = await build([], { fundingEvents, coverage: { [OutcomeCoverageType.FUNDING]: "2026-06-30" } }).builder.preview(S, "2023-12-31");
    expect(withCov.features).toMatchObject({ fundingRounds: 1, totalFundingRaised: 1_000_000 });
    const earlier = await build([], { fundingEvents, coverage: { [OutcomeCoverageType.FUNDING]: "2026-06-30" } }).builder.preview(S, "2021-12-31");
    expect(earlier.features.fundingRounds).toBe(0); // before the only round: a real, covered zero
  });
  it("customer evidence of a different metric type does not enter the series", async () => {
    const { builder } = build([
      ev({ fieldKey: "customerCount", valueNumeric: 100, valueText: "PATIENTS", effectiveDate: "2022-12-31" }),
      ev({ fieldKey: "customerCount", valueNumeric: 5, valueText: "CLINICS", effectiveDate: "2023-12-31" }),
    ]);
    expect((await builder.preview(S, "2023-12-31")).features.customerCount).toBe(100);
  });
  it("preview reports applicability-aware coverage: NOT_APPLICABLE leaves the denominator, absent declarations do not", async () => {
    const five = ["annualRevenue", "customerCount", "fundingRounds", "founderExperienceYears", "teamSize"].map((k) => ev({ fieldKey: k, valueNumeric: 1, effectiveDate: "2023-01-01" }));
    const na = { featureKey: "regulatoryMilestone", status: "NOT_APPLICABLE", effectiveDate: "2022-01-01", source: ScoreDataSource.ADMIN_ENTERED, verified: true };
    const aware = await build(five, { applicability: [na] }).builder.preview(S, "2023-12-31");
    expect(aware.coveragePct).toBeCloseTo(5 / 6, 5); // V1-style figure unchanged
    expect(aware.applicableCoreFeatures).toBe(5);
    expect(aware.coveragePctApplicable).toBe(1);
    const plain = await build(five).builder.preview(S, "2023-12-31");
    expect(plain.applicableCoreFeatures).toBe(6);
    expect(plain.coveragePctApplicable).toBeCloseTo(5 / 6, 5);
  });
  it("building from evidence is an explicit step: saving evidence alone never creates a snapshot", async () => {
    const { createHistoricalSnapshot } = build([ev({ fieldKey: "teamSize", valueNumeric: 4, effectiveDate: "2023-01-01" })]);
    expect(createHistoricalSnapshot).not.toHaveBeenCalled();
  });
  it("a snapshot created through MlSnapshotService gets the eligibility its selection method implies", async () => {
    const snapshots = memoryRepo();
    const svc = new MlSnapshotService(snapshots as any, {} as any, {} as any, {} as any);
    const startup = { id: S, stage: "Seed", category: "MedTech", scoreVersion: "RUWAD-2.0" } as any;
    const grid = await svc.createHistoricalSnapshot(startup, {}, {}, new Date("2023-12-31T00:00:00Z"), 0.5, "t", SnapshotSelectionMethod.FIXED_CALENDAR_GRID);
    const legacy = await svc.createHistoricalSnapshot(startup, {}, {}, new Date("2022-10-16T00:00:00Z"), 0.5, "t", SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE);
    const undeclared = await svc.createHistoricalSnapshot(startup, {}, {}, new Date("2021-06-30T00:00:00Z"), 0.5, "t");
    expect([grid.trainingEligibility, legacy.trainingEligibility, undeclared.trainingEligibility]).toEqual([TrainingEligibility.ELIGIBLE, TrainingEligibility.ANALYSIS_ONLY, TrainingEligibility.ANALYSIS_ONLY]);
    expect(grid.snapshotSource).toBe(MlSnapshotSource.HISTORICAL_RECONSTRUCTION);
  });
});

describe("HistoricalSnapshotBuilder — eligibility metadata", () => {
  const mk = (row: Record<string, any>) => {
    const snapshotRows = memoryRepo([row]);
    return { snapshotRows, builder: new HistoricalSnapshotBuilder({} as any, {} as any, snapshotRows as any, {} as any, {} as any) };
  };
  const row = (over: Record<string, any> = {}) => ({ id: "x", snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, features: { teamSize: 3 }, trainingEligibility: TrainingEligibility.ANALYSIS_ONLY, ...over });

  it("a legacy outcome-aware snapshot can never be made ELIGIBLE", async () => {
    const { builder } = mk(row({ selectionMethod: SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE }));
    await expect(builder.setTrainingEligibility("x", TrainingEligibility.ELIGIBLE)).rejects.toThrow(/cannot be made training-eligible/);
  });
  it("an undeclared snapshot cannot be made ELIGIBLE either", async () => {
    const { builder } = mk(row());
    await expect(builder.setTrainingEligibility("x", TrainingEligibility.ELIGIBLE)).rejects.toThrow(/UNDECLARED/);
  });
  it("a grid snapshot can be EXCLUDED and restored, touching only the eligibility column", async () => {
    const { builder, snapshotRows } = mk(row({ selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.ELIGIBLE }));
    await builder.setTrainingEligibility("x", TrainingEligibility.EXCLUDED, "Duplicate of another snapshot");
    expect(snapshotRows.update).toHaveBeenCalledWith({ id: "x" }, { trainingEligibility: "EXCLUDED" });
    await builder.setTrainingEligibility("x", TrainingEligibility.ELIGIBLE);
    expect(snapshotRows.rows[0].features).toEqual({ teamSize: 3 });
  });
});
