import { HistoricalEvidenceService } from "./historical-evidence.service";
import { EvidenceStatus, HistoricalEvidenceSourceType, SourceReliability } from "../../common/enums";
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
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => row[k] === v));
}

function input(over: Partial<any> = {}) {
  return {
    startupId: "s1", fieldKey: "totalFundingRaised", valueNumeric: 8_000_000, currency: "SAR",
    effectiveDate: "2023-01-01", sourceType: HistoricalEvidenceSourceType.PUBLIC_COMPANY_SOURCE,
    verified: false, reliability: SourceReliability.HIGH, ...over,
  };
}

describe("HistoricalEvidenceService.record — conflict detection", () => {
  it("a single fact for a field has no conflict", async () => {
    const evidence = fakeRepo();
    const audit = fakeRepo();
    const svc = new HistoricalEvidenceService(evidence as any, audit as any);
    const row = await svc.record(input());
    expect(row.status).toBe(EvidenceStatus.NO_CONFLICT);
  });

  it("two DIFFERENT values for the same startup+field+effectiveDate are a conflict — both preserved, neither silently overwritten", async () => {
    const evidence = fakeRepo();
    const audit = fakeRepo();
    const svc = new HistoricalEvidenceService(evidence as any, audit as any);
    const first = await svc.record(input({ valueNumeric: 3_200_000, reliability: SourceReliability.MEDIUM }));
    const second = await svc.record(input({ valueNumeric: 4_000_000, reliability: SourceReliability.PRIMARY }));

    const reloadedFirst = evidence.rows.find((r) => r.id === first.id)!;
    expect(reloadedFirst.status).toBe(EvidenceStatus.CONFLICT);
    expect(second.status).toBe(EvidenceStatus.CONFLICT);
    // both values still exist, unchanged
    expect(reloadedFirst.valueNumeric).toBe(3_200_000);
    expect(second.valueNumeric).toBe(4_000_000);
  });

  it("the SAME value reported twice for the same date is not treated as a conflict", async () => {
    const evidence = fakeRepo();
    const audit = fakeRepo();
    const svc = new HistoricalEvidenceService(evidence as any, audit as any);
    const first = await svc.record(input({ valueNumeric: 8_000_000 }));
    const second = await svc.record(input({ valueNumeric: 8_000_000 }));
    expect(evidence.rows.find((r) => r.id === first.id)!.status).toBe(EvidenceStatus.NO_CONFLICT);
    expect(second.status).toBe(EvidenceStatus.NO_CONFLICT);
  });

  it("evidence for a DIFFERENT effectiveDate is never treated as a conflict — time legitimately passed", async () => {
    const evidence = fakeRepo();
    const audit = fakeRepo();
    const svc = new HistoricalEvidenceService(evidence as any, audit as any);
    const jan = await svc.record(input({ effectiveDate: "2023-01-01", valueNumeric: 3_000_000 }));
    const aug = await svc.record(input({ effectiveDate: "2023-08-01", valueNumeric: 8_000_000 }));
    expect(evidence.rows.find((r) => r.id === jan.id)!.status).toBe(EvidenceStatus.NO_CONFLICT);
    expect(aug.status).toBe(EvidenceStatus.NO_CONFLICT);
  });
});

describe("HistoricalEvidenceService.resolveConflict — explicit admin action only", () => {
  it("marks the chosen row PREFERRED and the other SUPERSEDED, writing an audit row", async () => {
    const evidence = fakeRepo();
    const audit = fakeRepo();
    const svc = new HistoricalEvidenceService(evidence as any, audit as any);
    const a = await svc.record(input({ valueNumeric: 3_200_000, reliability: SourceReliability.MEDIUM }));
    await svc.record(input({ valueNumeric: 4_000_000, reliability: SourceReliability.PRIMARY }));

    const preferred = await svc.resolveConflict(a.id, "admin-1", "Verified with founder directly");

    expect(preferred.status).toBe(EvidenceStatus.PREFERRED);
    const other = evidence.rows.find((r) => r.fieldKey === "totalFundingRaised" && r.id !== a.id)!;
    expect(other.status).toBe(EvidenceStatus.SUPERSEDED);
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows.some((r) => r.adminUserId === "admin-1")).toBe(true);
  });

  it("refuses to resolve a row that isn't actually in CONFLICT", async () => {
    const evidence = fakeRepo();
    const audit = fakeRepo();
    const svc = new HistoricalEvidenceService(evidence as any, audit as any);
    const row = await svc.record(input());
    await expect(svc.resolveConflict(row.id, "admin-1", "reason")).rejects.toThrow(BadRequestException);
  });
});
