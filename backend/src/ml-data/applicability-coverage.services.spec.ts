import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FeatureApplicabilityService } from "./feature-applicability.service";
import { OutcomeCoverageService } from "./outcome-coverage.service";
import { FeatureApplicabilityStatus, OutcomeCoverageMethod, OutcomeCoverageType, ScoreDataSource, SourceReliability } from "../common/enums";
import { memoryRepo } from "./testing/training-fakes";

const S1 = "11111111-1111-4111-8111-111111111111";
const startups = () => memoryRepo([{ id: S1, name: "Acme" }]);

describe("FeatureApplicabilityService", () => {
  const base = { startupId: S1, featureKey: "regulatoryMilestone", effectiveDate: "2024-01-01", source: ScoreDataSource.ADMIN_ENTERED, createdBy: "admin-1" };

  it("NOT_APPLICABLE is never inferred: it needs an explicit reason", async () => {
    const svc = new FeatureApplicabilityService(memoryRepo() as any, startups() as any);
    await expect(svc.declare({ ...base, status: FeatureApplicabilityStatus.NOT_APPLICABLE })).rejects.toThrow(/explicit reason/);
    await expect(svc.declare({ ...base, status: FeatureApplicabilityStatus.NOT_APPLICABLE, reason: "n/a" })).rejects.toThrow(/explicit reason/);
  });
  it("stores the declaration with its date, provenance and reason — unverified unless the admin says so", async () => {
    const repo = memoryRepo();
    const svc = new FeatureApplicabilityService(repo as any, startups() as any);
    const row = await svc.declare({ ...base, status: FeatureApplicabilityStatus.NOT_APPLICABLE, reason: "Pure marketplace with no regulated product." });
    expect(row).toMatchObject({ status: "NOT_APPLICABLE", effectiveDate: "2024-01-01", source: "ADMIN_ENTERED", verified: false, startupId: S1 });
    expect(repo.rows).toHaveLength(1);
  });
  it("refuses non-feature keys, bad/future dates, unknown startups and founder-sourced direct writes", async () => {
    const svc = new FeatureApplicabilityService(memoryRepo() as any, startups() as any);
    const ok = { ...base, status: FeatureApplicabilityStatus.APPLICABLE };
    await expect(svc.declare({ ...ok, featureKey: "favouriteColour" })).rejects.toThrow(/not an ML feature/);
    await expect(svc.declare({ ...ok, effectiveDate: "2024-13-40" })).rejects.toThrow(/valid YYYY-MM-DD/);
    await expect(svc.declare({ ...ok, effectiveDate: "2999-01-01" })).rejects.toThrow(/future/);
    await expect(svc.declare({ ...ok, startupId: "33333333-3333-4333-8333-333333333333" })).rejects.toThrow(NotFoundException);
    await expect(svc.declare({ ...ok, source: ScoreDataSource.FOUNDER_SUBMITTED })).rejects.toThrow(/admin review/);
  });
  it("revoking keeps the row (append-only) but marks it withdrawn, with a reason", async () => {
    const repo = memoryRepo();
    const svc = new FeatureApplicabilityService(repo as any, startups() as any);
    const row = await svc.declare({ ...base, status: FeatureApplicabilityStatus.APPLICABLE });
    await expect(svc.revoke(row.id, " ")).rejects.toThrow(BadRequestException);
    const revoked = await svc.revoke(row.id, "Entered against the wrong company");
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(repo.rows).toHaveLength(1);
  });
});

describe("OutcomeCoverageService", () => {
  const input = { startupId: S1, coverageType: OutcomeCoverageType.FUNDING, coverageThrough: "2026-06-30", sourceSummary: "Founder funding history plus PitchBook export.", method: OutcomeCoverageMethod.ADMIN_RESEARCH, confidence: SourceReliability.HIGH, verifiedBy: "admin-1" };

  it("records a per-family attestation, verified by a named reviewer", async () => {
    const repo = memoryRepo();
    const svc = new OutcomeCoverageService(repo as any, startups() as any);
    const row = await svc.attest(input);
    expect(row).toMatchObject({ coverageType: "FUNDING", coverageThrough: "2026-06-30", verifiedBy: "admin-1" });
    expect(row.verifiedAt).toBeInstanceOf(Date);
  });
  it("refuses coverage through a future date, unknown families, empty summaries, unverified and unknown startups", async () => {
    const svc = new OutcomeCoverageService(memoryRepo() as any, startups() as any);
    await expect(svc.attest({ ...input, coverageThrough: "2999-01-01" })).rejects.toThrow(/future/);
    await expect(svc.attest({ ...input, coverageType: "NOPE" as OutcomeCoverageType })).rejects.toThrow(/Unknown coverage type/);
    await expect(svc.attest({ ...input, sourceSummary: "ok" })).rejects.toThrow(/which sources/);
    await expect(svc.attest({ ...input, verifiedBy: "" })).rejects.toThrow(/named reviewer/);
    await expect(svc.attest({ ...input, startupId: "33333333-3333-4333-8333-333333333333" })).rejects.toThrow(NotFoundException);
  });
  it("effectiveFor returns one date per family — FUNDING coverage says nothing about any other family", async () => {
    const svc = new OutcomeCoverageService(memoryRepo() as any, startups() as any);
    await svc.attest(input);
    await svc.attest({ ...input, coverageThrough: "2026-09-30" });
    expect(await svc.effectiveFor(S1)).toEqual({ FUNDING: "2026-09-30" });
  });
  it("a revoked attestation stops counting", async () => {
    const svc = new OutcomeCoverageService(memoryRepo() as any, startups() as any);
    const row = await svc.attest(input);
    await svc.revoke(row.id, "Source turned out to be incomplete");
    expect(await svc.effectiveFor(S1)).toEqual({});
  });
});
