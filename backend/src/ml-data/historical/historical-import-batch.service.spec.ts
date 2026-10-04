import { HistoricalImportBatchService } from "./historical-import-batch.service";
import { HistoricalEvidenceSourceType, IdentityMatchedBy, IdentityMatchStatus, ImportBatchStatus } from "../../common/enums";

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
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "type" in v ? row[k] == null : row[k] === v)));
}

const CSV_ONE_MATCHED_FEATURE = [
  "record_type,startup_name,startup_domain,field_key,value_numeric,effective_date,source_type,source_name",
  "FEATURE,Example Health,examplehealth.com,teamSize,12,2023-01-01,ADMIN_ENTERED,Research",
].join("\r\n");

const CSV_ONE_UNMATCHED_FEATURE = [
  "record_type,startup_name,field_key,value_numeric,effective_date,source_type",
  "FEATURE,Totally Unknown Startup,teamSize,12,2023-01-01,ADMIN_ENTERED",
].join("\r\n");

const CSV_WITH_ONE_BAD_ROW = [
  "record_type,startup_name,field_key,value_numeric,effective_date,source_type",
  "FEATURE,Example Health,teamSize,12,2023-01-01,ADMIN_ENTERED",
  "FEATURE,Example Health,notARealKey,5,2023-01-01,ADMIN_ENTERED",
].join("\r\n");

function makeService(matchResult: { matchStatus: IdentityMatchStatus; startupId?: string; matchedBy?: IdentityMatchedBy }) {
  const batches = fakeRepo();
  const rows = fakeRepo();
  const events = fakeRepo();
  const matching = { matchCandidate: jest.fn(async () => matchResult), resolveAndPersist: jest.fn(async () => matchResult) } as any;
  const recordCalls: any[] = [];
  const evidenceSvc = { record: jest.fn(async (input: any) => { recordCalls.push(input); return { id: "ev-1", ...input }; }) } as any;
  const svc = new HistoricalImportBatchService(batches as any, rows as any, events as any, matching, evidenceSvc);
  return { svc, batches, rows, events, matching, evidenceSvc, recordCalls };
}

describe("HistoricalImportBatchService.process — dry run writes nothing but the batch row", () => {
  it("a dry run with a matched startup writes ONLY the batch row", async () => {
    const { svc, batches, rows, evidenceSvc } = makeService({ matchStatus: IdentityMatchStatus.MATCHED, startupId: "s1", matchedBy: IdentityMatchedBy.DOMAIN });
    const batch = await svc.process({ csvText: CSV_ONE_MATCHED_FEATURE, sourceName: "Research", sourceType: HistoricalEvidenceSourceType.ADMIN_ENTERED, fileName: "t.csv", importedBy: "admin-1", dryRun: true });

    expect(batch.status).toBe(ImportBatchStatus.DRY_RUN_COMPLETE);
    expect(batch.rowsAccepted).toBe(1);
    expect(evidenceSvc.record).not.toHaveBeenCalled();
    expect(rows.rows).toHaveLength(0);
    expect(batches.rows).toHaveLength(1); // only the batch itself
  });

  it("a dry run never calls resolveAndPersist (read-only matching)", async () => {
    const { svc, matching } = makeService({ matchStatus: IdentityMatchStatus.MATCHED, startupId: "s1" });
    await svc.process({ csvText: CSV_ONE_MATCHED_FEATURE, sourceName: "Research", sourceType: HistoricalEvidenceSourceType.ADMIN_ENTERED, fileName: "t.csv", importedBy: "admin-1", dryRun: true });
    expect(matching.resolveAndPersist).not.toHaveBeenCalled();
    expect(matching.matchCandidate).toHaveBeenCalled();
  });
});

describe("HistoricalImportBatchService.process — commit", () => {
  it("a matched row is written as real evidence", async () => {
    const { svc, evidenceSvc, recordCalls } = makeService({ matchStatus: IdentityMatchStatus.MATCHED, startupId: "s1" });
    const batch = await svc.process({ csvText: CSV_ONE_MATCHED_FEATURE, sourceName: "Research", sourceType: HistoricalEvidenceSourceType.ADMIN_ENTERED, fileName: "t.csv", importedBy: "admin-1", dryRun: false });

    expect(batch.status).toBe(ImportBatchStatus.COMPLETED);
    expect(evidenceSvc.record).toHaveBeenCalledTimes(1);
    expect(recordCalls[0].startupId).toBe("s1");
    expect(recordCalls[0].fieldKey).toBe("teamSize");
  });

  it("an unmatched row is staged in historical_import_rows, never written as evidence", async () => {
    const { svc, rows, evidenceSvc, batches } = makeService({ matchStatus: IdentityMatchStatus.UNMATCHED });
    const batch = await svc.process({ csvText: CSV_ONE_UNMATCHED_FEATURE, sourceName: "Research", sourceType: HistoricalEvidenceSourceType.ADMIN_ENTERED, fileName: "t.csv", importedBy: "admin-1", dryRun: false });

    expect(evidenceSvc.record).not.toHaveBeenCalled();
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe("PENDING");
    expect(batch.rowsNeedsReview).toBe(1);
    expect(batches.rows.find((b) => b.id === batch.id)!.status).toBe(ImportBatchStatus.PARTIAL);
  });

  it("a partial file (one valid row, one invalid) reports both counts correctly", async () => {
    const { svc } = makeService({ matchStatus: IdentityMatchStatus.MATCHED, startupId: "s1" });
    const batch = await svc.process({ csvText: CSV_WITH_ONE_BAD_ROW, sourceName: "Research", sourceType: HistoricalEvidenceSourceType.ADMIN_ENTERED, fileName: "t.csv", importedBy: "admin-1", dryRun: true });
    expect(batch.rowsAccepted).toBe(1);
    expect(batch.rowsRejected).toBe(1);
  });
});

describe("HistoricalImportBatchService — outcome event dedup", () => {
  const CSV_EVENT = [
    "record_type,startup_name,event_type,effective_date,value_numeric,source_type",
    "OUTCOME_EVENT,Example Health,FUNDING_ROUND,2023-08-15,5000000,PUBLIC_NEWS_SOURCE",
  ].join("\r\n");

  it("importing the same funding event twice does not create a duplicate outcome event", async () => {
    const batches = fakeRepo();
    const rows = fakeRepo();
    const events = fakeRepo();
    const matching = { matchCandidate: jest.fn(async () => ({ matchStatus: IdentityMatchStatus.MATCHED, startupId: "s1" })), resolveAndPersist: jest.fn(async () => ({ matchStatus: IdentityMatchStatus.MATCHED, startupId: "s1" })) } as any;
    const evidenceSvc = { record: jest.fn() } as any;
    const svc = new HistoricalImportBatchService(batches as any, rows as any, events as any, matching, evidenceSvc);

    await svc.process({ csvText: CSV_EVENT, sourceName: "MAGNiTT", sourceType: HistoricalEvidenceSourceType.PUBLIC_NEWS_SOURCE, fileName: "e.csv", importedBy: "admin-1", dryRun: false });
    await svc.process({ csvText: CSV_EVENT, sourceName: "MAGNiTT", sourceType: HistoricalEvidenceSourceType.PUBLIC_NEWS_SOURCE, fileName: "e.csv", importedBy: "admin-1", dryRun: false });

    expect(events.rows).toHaveLength(1);
  });
});
