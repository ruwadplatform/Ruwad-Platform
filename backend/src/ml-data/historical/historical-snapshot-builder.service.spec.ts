import { HistoricalSnapshotBuilder } from "./historical-snapshot-builder.service";
import { EvidenceStatus, HistoricalEvidenceSourceType, MlSnapshotSource, SourceReliability } from "../../common/enums";
import { BadRequestException } from "@nestjs/common";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => rows.find((r) => matches(r, opts.where)) ?? null),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
  };
}
function fieldEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => fieldEquals(row[k], v)));
}

function evidenceRow(over: Partial<any> = {}) {
  return {
    id: `e-${Math.random()}`, startupId: "s1", fieldKey: "totalFundingRaised", valueNumeric: 1000, effectiveDate: "2023-01-01",
    status: EvidenceStatus.NO_CONFLICT, reliability: SourceReliability.HIGH, verified: false, sourceType: HistoricalEvidenceSourceType.PUBLIC_COMPANY_SOURCE,
    ...over,
  };
}

const startup = { id: "s1", name: "Example Health", stage: "Seed", category: "Digital Health", scoreVersion: "RUWAD-2.0" };

const emptyContext = { load: async () => ({ careers: [], applicability: [], fundingEvents: [], coverage: {} }) };

function makeBuilder(evidenceRows: any[]) {
  const evidence = fakeRepo(evidenceRows);
  const startups = fakeRepo([startup]);
  const snapshotRows = fakeRepo();
  const createHistoricalSnapshot = jest.fn(async (s, features, provenance, snapshotAt, dataConfidence, reason, selectionMethod?: string) => {
    const row = { id: "snap-1", startupId: s.id, features, snapshotAt, dataConfidence, snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, reason, selectionMethod };
    snapshotRows.rows.push(row);
    return row;
  });
  const snapshots = { createHistoricalSnapshot } as any;
  const builder = new HistoricalSnapshotBuilder(evidence as any, startups as any, snapshotRows as any, snapshots, emptyContext as any);
  return { builder, evidence, snapshotRows, createHistoricalSnapshot };
}

describe("HistoricalSnapshotBuilder — leakage prevention", () => {
  it("a snapshot built for 2023-01-01 never includes evidence dated after that", async () => {
    const { builder } = makeBuilder([
      evidenceRow({ effectiveDate: "2022-12-01", valueNumeric: 1_000_000 }),
      evidenceRow({ id: "future", effectiveDate: "2023-08-01", valueNumeric: 5_000_000, fieldKey: "totalFundingRaised" }),
    ]);
    const preview = await builder.preview("s1", "2023-01-01");
    expect(preview.features.totalFundingRaised).toBe(1_000_000);
  });

  it("a later snapshot CAN see later evidence", async () => {
    const { builder } = makeBuilder([
      evidenceRow({ effectiveDate: "2022-12-01", valueNumeric: 1_000_000 }),
      evidenceRow({ effectiveDate: "2023-08-01", valueNumeric: 5_000_000 }),
    ]);
    const preview = await builder.preview("s1", "2023-12-01");
    expect(preview.features.totalFundingRaised).toBe(5_000_000);
  });

  it("a future patent grant is excluded from an earlier snapshot", async () => {
    const { builder } = makeBuilder([
      evidenceRow({ fieldKey: "patentsGranted", valueNumeric: 0, effectiveDate: "2022-06-01" }),
      evidenceRow({ fieldKey: "patentsGranted", valueNumeric: 1, effectiveDate: "2025-01-01" }),
    ]);
    const preview = await builder.preview("s1", "2023-01-01");
    expect(preview.features.patentsGranted).toBe(0);
  });

  it("a genuinely conflicting field (same date, different values) is left unresolved, never guessed", async () => {
    const { builder } = makeBuilder([
      evidenceRow({ id: "a", effectiveDate: "2023-01-01", valueNumeric: 3_000_000 }),
      evidenceRow({ id: "b", effectiveDate: "2023-01-01", valueNumeric: 8_000_000, status: EvidenceStatus.CONFLICT }),
    ]);
    const preview = await builder.preview("s1", "2023-06-01");
    expect(preview.features.totalFundingRaised).toBeUndefined();
    expect(preview.unresolvedFields).toContain("totalFundingRaised");
  });

  it("a PREFERRED row wins over a conflicting SUPERSEDED one, even at the same date", async () => {
    const { builder } = makeBuilder([
      evidenceRow({ id: "a", effectiveDate: "2023-01-01", valueNumeric: 3_000_000, status: EvidenceStatus.SUPERSEDED }),
      evidenceRow({ id: "b", effectiveDate: "2023-01-01", valueNumeric: 8_000_000, status: EvidenceStatus.PREFERRED }),
    ]);
    const preview = await builder.preview("s1", "2023-06-01");
    expect(preview.features.totalFundingRaised).toBe(8_000_000);
  });
});

describe("HistoricalSnapshotBuilder — immutability", () => {
  it("refuses to build a duplicate snapshot for the same (startupId, snapshotAt)", async () => {
    const { builder, snapshotRows } = makeBuilder([evidenceRow()]);
    snapshotRows.rows.push({ startupId: "s1", snapshotAt: new Date("2023-01-01T00:00:00Z") });
    await expect(builder.build("s1", "2023-01-01", "test")).rejects.toThrow(BadRequestException);
  });

  it("build() calls MlSnapshotService.createHistoricalSnapshot with the resolved feature vector", async () => {
    const { builder, createHistoricalSnapshot } = makeBuilder([evidenceRow({ valueNumeric: 2_000_000 })]);
    await builder.build("s1", "2023-01-01", "test reason");
    expect(createHistoricalSnapshot).toHaveBeenCalled();
    const [, features] = createHistoricalSnapshot.mock.calls[0];
    expect(features.totalFundingRaised).toBe(2_000_000);
  });
});

describe("HistoricalSnapshotBuilder — Cohort 3 safeguards", () => {
  const sixCore = [
    evidenceRow({ fieldKey: "annualRevenue", valueNumeric: 100, effectiveDate: "2022-06-01" }),
    evidenceRow({ fieldKey: "customerCount", valueNumeric: 50, effectiveDate: "2022-06-01" }),
    evidenceRow({ fieldKey: "fundingRounds", valueNumeric: 1, effectiveDate: "2022-06-01" }),
    evidenceRow({ fieldKey: "teamSize", valueNumeric: 9, effectiveDate: "2022-06-01" }),
  ];

  it("preview classifies density: SPARSE <=2, ACCEPTABLE 3, RICH >=4 core features", async () => {
    expect((await makeBuilder(sixCore.slice(0, 2)).builder.preview("s1", "2022-12-31")).densityClass).toBe("SPARSE");
    expect((await makeBuilder(sixCore.slice(0, 3)).builder.preview("s1", "2022-12-31")).densityClass).toBe("ACCEPTABLE");
    expect((await makeBuilder(sixCore).builder.preview("s1", "2022-12-31")).densityClass).toBe("RICH");
  });

  it("minDensity refuses to build a snapshot below the bar and writes nothing", async () => {
    const { builder, createHistoricalSnapshot } = makeBuilder(sixCore.slice(0, 2));
    await expect(builder.build("s1", "2022-12-31", "pilot", { minDensity: "ACCEPTABLE" })).rejects.toThrow(/SPARSE/);
    expect(createHistoricalSnapshot).not.toHaveBeenCalled();
  });

  it("builds a RICH snapshot and passes the selection method through", async () => {
    const { builder, createHistoricalSnapshot } = makeBuilder(sixCore);
    await builder.build("s1", "2022-12-31", "pilot", { minDensity: "RICH", selectionMethod: "FIXED_CALENDAR_GRID" as any });
    expect(createHistoricalSnapshot.mock.calls[0][6]).toBe("FIXED_CALENDAR_GRID");
  });

  it("a FIXED_CALENDAR_GRID snapshot must be dated June 30 or December 31", async () => {
    const { builder, createHistoricalSnapshot } = makeBuilder(sixCore);
    await expect(builder.build("s1", "2022-10-16", "pilot", { selectionMethod: "FIXED_CALENDAR_GRID" as any })).rejects.toThrow(/June 30 or December 31/);
    expect(createHistoricalSnapshot).not.toHaveBeenCalled();
  });

  it("existing callers (no options) are unaffected: a SPARSE snapshot still builds and selectionMethod stays undefined", async () => {
    const { builder, createHistoricalSnapshot } = makeBuilder(sixCore.slice(0, 1));
    await builder.build("s1", "2022-12-31", "legacy path");
    expect(createHistoricalSnapshot.mock.calls[0][6]).toBeUndefined();
  });

  describe("tagSelectionMethod — declare once, never rewrite", () => {
    function tagging(row: Record<string, any>) {
      const snapshotRows: any = { findOne: jest.fn(async () => row), update: jest.fn(async (_w: any, patch: any) => Object.assign(row, patch)) };
      return { snapshotRows, builder: new HistoricalSnapshotBuilder({} as any, {} as any, snapshotRows, {} as any, emptyContext as any) };
    }
    it("tags an untagged historical snapshot touching only selectionMethod", async () => {
      const { builder, snapshotRows } = tagging({ id: "x", snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, features: { teamSize: 3 } });
      await builder.tagSelectionMethod("x", "LEGACY_OUTCOME_AWARE" as any);
      // metadata only — never features/dates; eligibility follows from the method (outcome-aware => ANALYSIS_ONLY)
      expect(snapshotRows.update).toHaveBeenCalledWith({ id: "x" }, { selectionMethod: "LEGACY_OUTCOME_AWARE", trainingEligibility: "ANALYSIS_ONLY" });
    });
    it("refuses to change a method that was already declared, but allows re-declaring the same one", async () => {
      const { builder, snapshotRows } = tagging({ id: "x", snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION, selectionMethod: "LEGACY_OUTCOME_AWARE" });
      await expect(builder.tagSelectionMethod("x", "FIXED_CALENDAR_GRID" as any)).rejects.toThrow(/already tagged/);
      await builder.tagSelectionMethod("x", "LEGACY_OUTCOME_AWARE" as any);
      expect(snapshotRows.update).not.toHaveBeenCalled();
    });
    it("rejects non-historical snapshots", async () => {
      const { builder } = tagging({ id: "x", snapshotSource: MlSnapshotSource.MATERIAL_CHANGE });
      await expect(builder.tagSelectionMethod("x", "FIXED_CALENDAR_GRID" as any)).rejects.toThrow(/Only historical-reconstruction/);
    });
  });
});
