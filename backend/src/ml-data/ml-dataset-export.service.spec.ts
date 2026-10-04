import { MlDatasetExportService, rowsToCsv } from "./ml-dataset-export.service";
import { MlSnapshotSource, OutcomeCoverageType, OutcomeEventSource, SnapshotSelectionMethod, StartupOutcomeEventType, TrainingEligibility } from "../common/enums";
import { trainingService } from "./testing/training-fakes";
import { ML_FEATURES_V1 } from "./ml-data.constants";

function fakeRepo(seed: Record<string, any>[] = []) {
  return { rows: seed, find: jest.fn(async () => seed) };
}

/** Production-path service over fake repos; startup s1 has FUNDING coverage through the test "now" so a window with no event is a defensible negative. */
function svcFor(snapshots: { rows: any[] }, events: { rows: any[] }, coverage: any[] = [{ startupId: "s1", coverageType: OutcomeCoverageType.FUNDING, coverageThrough: "2027-09-29" }]) {
  return new MlDatasetExportService(trainingService({ snapshots: snapshots.rows, events: events.rows, coverage }));
}

const richSnapshot = (over: Record<string, any> = {}) => ({
  id: "snap-1", startupId: "s1", snapshotAt: new Date("2026-09-28T00:00:00.000Z"),
  scoreVersion: "RUWAD-2.0", featureSchemaVersion: "ML-FEATURES-1.0",
  features: { annualRevenue: 2_000_000, customerCount: 50, founderExperienceYears: 10 },
  provenanceSummary: { annualRevenue: { verified: true }, customerCount: { verified: false } },
  dataConfidence: 0.8, scoreStatus: "CALCULATED", startupStage: "Seed", category: "Digital Health",
  snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, reason: "first snapshot",
  selectionMethod: SnapshotSelectionMethod.FIXED_CALENDAR_GRID, trainingEligibility: TrainingEligibility.ELIGIBLE,
  ...over,
});

const fundingEvent = (over: Record<string, any> = {}) => ({
  id: "e1", startupId: "s1", eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-06-01",
  valueNumeric: 5_000_000, source: OutcomeEventSource.ADMIN_ENTERED, verified: true,
  ...over,
});

describe("MlDatasetExportService — leakage safety", () => {
  it("only reads from snapshots, never substituting a startup's current live state", async () => {
    const snapshots = fakeRepo([richSnapshot()]);
    const events = fakeRepo([fundingEvent({ eventDate: "2027-01-01" })]);
    const svc = svcFor(snapshots, events);
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, new Date("2027-09-29T00:00:00.000Z"));
    // Confirms the feature values in the row are exactly the frozen snapshot's, not re-derived from anywhere else.
    expect(rows[0].annualRevenue).toBe(2_000_000);
  });

  it("a funding event dated after the observation window never appears in that row's positive label", async () => {
    const snapshots = fakeRepo([richSnapshot()]);
    const events = fakeRepo([fundingEvent({ eventDate: "2028-06-01" })]); // 21 months out, past the 12-month window
    const svc = svcFor(snapshots, events);
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeImmature: true }, new Date("2027-09-29T00:00:00.000Z"));
    expect(rows[0].target_raisedNewRoundWithin12Months).toBe(false);
  });
});

describe("MlDatasetExportService — PII / score exclusion", () => {
  it("never includes ruwadScore, factors, or any score-derived field — they were never part of ScoringFeatures", async () => {
    const snapshots = fakeRepo([richSnapshot()]);
    const svc = svcFor(snapshots, fakeRepo());
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeImmature: true }, new Date("2027-09-29T00:00:00.000Z"));
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("ruwadScore");
    expect(keys).not.toContain("factors");
    expect(keys).not.toContain("finalScore");
    // dataConfidence is a filter input, never a feature column.
    expect(keys).not.toContain("dataConfidence");
  });

  it("only ever emits ML_FEATURES_V1-allowlisted feature keys, never an arbitrary snapshot field", async () => {
    const snapshots = fakeRepo([richSnapshot({ features: { annualRevenue: 1, notAnAllowlistedKey: "sneaky" } })]);
    const svc = svcFor(snapshots, fakeRepo());
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeImmature: true }, new Date("2027-09-29T00:00:00.000Z"));
    const featureKeys = Object.keys(rows[0]).filter((k) => ML_FEATURES_V1.includes(k as any));
    expect(featureKeys.every((k) => (ML_FEATURES_V1 as string[]).includes(k))).toBe(true);
    expect(rows[0]).not.toHaveProperty("notAnAllowlistedKey");
  });

  it("the allowlist itself never contains a name/email/phone/note-shaped key", () => {
    const banned = /name|email|phone|note|document|address/i;
    expect(ML_FEATURES_V1.some((k) => banned.test(k))).toBe(false);
  });
});

describe("MlDatasetExportService — immature exclusion", () => {
  it("excludes NOT_MATURED and INSUFFICIENT_DATA rows by default (eligible-only export)", async () => {
    const snapshots = fakeRepo([richSnapshot({ snapshotAt: new Date("2027-06-01T00:00:00.000Z") })]); // only 4 months old
    const svc = svcFor(snapshots, fakeRepo());
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, new Date("2027-09-29T00:00:00.000Z"));
    expect(rows).toHaveLength(0);
  });

  it("includeImmature:true keeps the row with its status column, never mixing an immature label in as a false negative", async () => {
    const snapshots = fakeRepo([richSnapshot({ snapshotAt: new Date("2027-06-01T00:00:00.000Z") })]);
    const svc = svcFor(snapshots, fakeRepo());
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeImmature: true }, new Date("2027-09-29T00:00:00.000Z"));
    expect(rows).toHaveLength(1);
    expect(rows[0].target_raisedNewRoundWithin12Months_status).toBe("NOT_MATURED");
    expect(rows[0].target_raisedNewRoundWithin12Months).toBeUndefined();
  });
});

describe("MlDatasetExportService — filters", () => {
  it("minConfidence excludes a low-confidence snapshot", async () => {
    const snapshots = fakeRepo([richSnapshot({ dataConfidence: 0.3 })]);
    const svc = svcFor(snapshots, fakeRepo());
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months", minConfidence: 0.5, includeImmature: true }, new Date("2027-09-29T00:00:00.000Z"));
    expect(rows).toHaveLength(0);
  });

  it("verifiedOnly blanks an unverified feature value rather than dropping the whole row", async () => {
    const snapshots = fakeRepo([richSnapshot()]);
    const svc = svcFor(snapshots, fakeRepo());
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months", verifiedOnly: true, includeImmature: true }, new Date("2027-09-29T00:00:00.000Z"));
    expect(rows).toHaveLength(1); // row kept
    expect(rows[0].annualRevenue).toBe(2_000_000); // verified: true -> kept
    expect(rows[0].customerCount).toBeUndefined(); // verified: false -> blanked
  });

  it("includeIdentifiers:false strips startupId/snapshotId for the pure model-matrix mode", async () => {
    const snapshots = fakeRepo([richSnapshot()]);
    const svc = svcFor(snapshots, fakeRepo());
    const rows = await svc.exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeIdentifiers: false, includeImmature: true }, new Date("2027-09-29T00:00:00.000Z"));
    expect(rows[0]).not.toHaveProperty("startupId");
    expect(rows[0]).not.toHaveProperty("snapshotId");
  });
});

describe("MlDatasetExportService — legacy outcome-aware snapshots cannot silently enter production training", () => {
  const NOW = new Date("2027-09-29T00:00:00.000Z");
  const legacy = () => richSnapshot({ id: "snap-legacy", startupId: "s1", selectionMethod: SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE, trainingEligibility: TrainingEligibility.ANALYSIS_ONLY });
  const grid = () => richSnapshot({ id: "snap-grid", startupId: "s1" });

  it("the default export contains eligible rows only", async () => {
    const rows = await svcFor(fakeRepo([legacy(), grid()]), fakeRepo()).exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, NOW);
    expect(rows.map((r) => r.snapshotId)).toEqual(["snap-grid"]);
    expect(rows.every((r) => r.trainingEligibility === "ELIGIBLE")).toBe(true);
  });

  it("includeAnalysisOnly returns them, each labelled so it can be told apart", async () => {
    const rows = await svcFor(fakeRepo([legacy(), grid()]), fakeRepo()).exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeAnalysisOnly: true }, NOW);
    expect(rows).toHaveLength(2);
    const l = rows.find((r) => r.snapshotId === "snap-legacy")!;
    expect(l.trainingEligibility).toBe("ANALYSIS_ONLY");
    expect(l.snapshotSelectionMethod).toBe("LEGACY_OUTCOME_AWARE");
  });

  it("a legacy row whose stored flag was flipped to ELIGIBLE is still kept out (defence in depth)", async () => {
    const sneaky = richSnapshot({ id: "snap-sneaky", selectionMethod: SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE, trainingEligibility: TrainingEligibility.ELIGIBLE });
    const rows = await svcFor(fakeRepo([sneaky]), fakeRepo()).exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, NOW);
    expect(rows).toHaveLength(0);
  });

  it("an undeclared selection method is not trusted either", async () => {
    const undeclared = richSnapshot({ selectionMethod: undefined, trainingEligibility: TrainingEligibility.ELIGIBLE });
    expect(await svcFor(fakeRepo([undeclared]), fakeRepo()).exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, NOW)).toHaveLength(0);
  });

  it("EXCLUDED rows are only returned when explicitly requested", async () => {
    const ex = richSnapshot({ trainingEligibility: TrainingEligibility.EXCLUDED });
    expect(await svcFor(fakeRepo([ex]), fakeRepo()).exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeAnalysisOnly: true }, NOW)).toHaveLength(0);
    expect(await svcFor(fakeRepo([ex]), fakeRepo()).exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeExcluded: true }, NOW)).toHaveLength(1);
  });

  it("a negative label is withheld without attested coverage, and kept (as a real negative) with it", async () => {
    const without = await svcFor(fakeRepo([grid()]), fakeRepo(), []).exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, NOW);
    expect(without).toHaveLength(0);
    const audit = await svcFor(fakeRepo([grid()]), fakeRepo(), []).exportForTarget({ targetName: "raisedNewRoundWithin12Months", includeImmature: true }, NOW);
    expect(audit[0].target_raisedNewRoundWithin12Months_status).toBe("COVERAGE_UNATTESTED");
    expect(audit[0].target_raisedNewRoundWithin12Months).toBeUndefined();
    const withCoverage = await svcFor(fakeRepo([grid()]), fakeRepo()).exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, NOW);
    expect(withCoverage[0].target_raisedNewRoundWithin12Months).toBe(false);
  });

  it("a genuine positive is exported even with no coverage attestation", async () => {
    const rows = await svcFor(fakeRepo([grid()]), fakeRepo([fundingEvent({ eventDate: "2027-01-01" })]), []).exportForTarget({ targetName: "raisedNewRoundWithin12Months" }, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].target_raisedNewRoundWithin12Months).toBe(true);
  });
});

describe("rowsToCsv", () => {
  it("produces a header row plus one line per row, escaping commas/quotes", () => {
    const csv = rowsToCsv([{ a: 1, b: "hello, world" }, { a: 2, b: 'has "quotes"' }]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe('1,"hello, world"');
    expect(lines[2]).toBe('2,"has ""quotes"""');
  });
  it("returns an empty string for zero rows", () => {
    expect(rowsToCsv([])).toBe("");
  });
});
