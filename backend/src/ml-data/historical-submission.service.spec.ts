import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HistoricalSubmissionService } from "./historical-submission.service";
import { HistoricalEvidenceService } from "./historical/historical-evidence.service";
import { FeatureApplicabilityService } from "./feature-applicability.service";
import { OutcomeCoverageService } from "./outcome-coverage.service";
import { EvidenceStatus, FeatureApplicabilityStatus, HistoricalEvidenceSourceType, HistoricalReviewStatus, HistoricalSubmissionKind as K, OutcomeCoverageMethod, OutcomeCoverageType, OutcomeEventSource, ScoreDataSource, StartupOutcomeEventType, UserRole } from "../common/enums";
import { memoryRepo } from "./testing/training-fakes";
import { resolveApplicability } from "./feature-applicability";
import { deriveFounderFeatures } from "./historical/historical-derivation";

const STARTUP = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const founder = { userId: "founder-1", email: "f@x.sa", role: UserRole.FOUNDER };
const admin = { userId: "admin-1", email: "a@ruwad.sa", role: UserRole.RUWAD_ADMIN };

function setup(opts: { evidence?: any[]; events?: any[]; documents?: any[]; profileRounds?: any[] } = {}) {
  const startups = memoryRepo([{ id: STARTUP, name: "Acme Health", category: "MedTech", founded: 2020 }, { id: OTHER, name: "Other Co", category: "Digital Health", founded: 2019 }]);
  const submissions = memoryRepo();
  const events = memoryRepo(opts.events ?? []);
  const profileRounds = memoryRepo(opts.profileRounds ?? []);
  const documents = memoryRepo(opts.documents ?? []);
  const careers = memoryRepo();
  const evidenceRepo = memoryRepo(opts.evidence ?? []);
  const auditRepo = memoryRepo();
  const applicabilityRepo = memoryRepo();
  const coverageRepo = memoryRepo();
  const evidence = new HistoricalEvidenceService(evidenceRepo as any, auditRepo as any);
  const applicability = new FeatureApplicabilityService(applicabilityRepo as any, startups as any);
  const coverage = new OutcomeCoverageService(coverageRepo as any, startups as any);
  const svc = new HistoricalSubmissionService(submissions as any, startups as any, events as any, profileRounds as any, documents as any, careers as any, evidenceRepo as any, evidence, applicability, coverage);
  return { svc, submissions, events, evidenceRepo, applicabilityRepo, coverageRepo, careers, documents, startups };
}

const revenue = { kind: K.REVENUE, entry: { revenueType: "RECOGNIZED", periodStart: "2023-01-01", periodEnd: "2023-12-31", amount: 1_600_000, currency: "SAR" } };

describe("founder submissions — provenance and staging", () => {
  it("a founder entry is stored as FOUNDER_SUBMITTED / PENDING_REVIEW and writes NOTHING that feeds snapshots or labels", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, revenue);
    expect(row.source).toBe(ScoreDataSource.FOUNDER_SUBMITTED);
    expect(row.reviewStatus).toBe(HistoricalReviewStatus.PENDING_REVIEW);
    expect(row.effectiveDate).toBe("2023-12-31");
    expect(t.evidenceRepo.rows).toHaveLength(0);
    expect(t.events.rows).toHaveLength(0);
    expect(t.applicabilityRepo.rows).toHaveLength(0);
    expect(t.coverageRepo.rows).toHaveLength(0);
    expect(t.careers.rows).toHaveLength(0);
  });
  it("a founder-submitted NOT_APPLICABLE creates no applicability row until an admin approves it", async () => {
    const t = setup();
    await t.svc.submit(STARTUP, founder, { kind: K.REGULATORY_APPLICABILITY, entry: { answer: "NO", asOfDate: "2024-01-01", reason: "Pure marketplace; no regulated product." } });
    expect(t.applicabilityRepo.rows).toHaveLength(0);
  });
  it("a founder cannot set a source/verified flag: applicability cannot be written directly with FOUNDER_SUBMITTED", async () => {
    const t = setup();
    const direct = new FeatureApplicabilityService(t.applicabilityRepo as any, t.startups as any);
    await expect(direct.declare({ startupId: STARTUP, featureKey: "regulatoryMilestone", status: FeatureApplicabilityStatus.NOT_APPLICABLE, effectiveDate: "2024-01-01", reason: "Pure marketplace; no regulated product.", source: ScoreDataSource.FOUNDER_SUBMITTED })).rejects.toThrow(/admin review/);
  });
  it("a founder cannot review (verify) their own entry", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, revenue);
    await expect(t.svc.review(row.id, founder, "VERIFY")).rejects.toThrow(ForbiddenException);
    expect(t.evidenceRepo.rows).toHaveLength(0);
  });
  it("an entry cannot be edited or withdrawn through another startup's URL", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, revenue);
    await expect(t.svc.resubmit(OTHER, row.id, founder, { entry: revenue.entry })).rejects.toThrow(NotFoundException);
    await expect(t.svc.withdraw(OTHER, row.id)).rejects.toThrow(NotFoundException);
    expect(t.submissions.rows).toHaveLength(1);
  });
  it("listing is per startup", async () => {
    const t = setup();
    await t.svc.submit(STARTUP, founder, revenue);
    expect(await t.svc.listForStartup(OTHER)).toHaveLength(0);
    expect(await t.svc.listForStartup(STARTUP)).toHaveLength(1);
  });
  it("a founder can only reference a supporting document that belongs to their own startup", async () => {
    const t = setup({ documents: [{ id: "doc-own", entityType: "STARTUP", entityId: STARTUP, name: "Financials", onFile: true }, { id: "doc-other", entityType: "STARTUP", entityId: OTHER, name: "Financials", onFile: true }] });
    await expect(t.svc.submit(STARTUP, founder, { ...revenue, supportingDocumentId: "doc-other", supportingDocumentType: "FINANCIAL_STATEMENT" })).rejects.toThrow(BadRequestException);
    const ok = await t.svc.submit(STARTUP, founder, { ...revenue, supportingDocumentId: "doc-own", supportingDocumentType: "FINANCIAL_STATEMENT" });
    expect(ok.supportingDocumentId).toBe("doc-own");
    await expect(t.svc.submit(STARTUP, founder, { ...revenue, supportingDocumentType: "MY_DIARY" })).rejects.toThrow(/supportingDocumentType/);
  });
  it("a withdrawn pending entry disappears; an approved one cannot be withdrawn", async () => {
    const t = setup();
    const a = await t.svc.submit(STARTUP, founder, revenue);
    await t.svc.withdraw(STARTUP, a.id);
    expect(t.submissions.rows).toHaveLength(0);
    const b = await t.svc.submit(STARTUP, founder, revenue);
    await t.svc.review(b.id, admin, "VERIFY");
    await expect(t.svc.withdraw(STARTUP, b.id)).rejects.toThrow(/already become evidence/);
  });
});

describe("admin verification — evidence, provenance, dates", () => {
  it("VERIFY materialises dated, verified ADMIN_ENTERED evidence and preserves effective date and who submitted", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, revenue);
    const { submission } = await t.svc.review(row.id, admin, "VERIFY", { notes: "Matches the 2023 audited accounts." });
    expect(submission.reviewStatus).toBe(HistoricalReviewStatus.VERIFIED);
    expect(submission.reviewedBy).toBe("admin-1");
    expect(t.evidenceRepo.rows).toHaveLength(1);
    const ev = t.evidenceRepo.rows[0];
    expect(ev).toMatchObject({ fieldKey: "annualRevenue", valueNumeric: 1_600_000, currency: "SAR", effectiveDate: "2023-12-31", sourceType: HistoricalEvidenceSourceType.ADMIN_ENTERED, verified: true, createdBy: "founder-1" });
    expect(ev.verificationNotes).toMatch(/Matches the 2023 audited accounts/);
    expect(submission.materialized?.evidence).toEqual([ev.id]);
  });
  it("a validated supporting document upgrades provenance to VERIFIED_DOCUMENT (the strongest existing source)", async () => {
    const t = setup({ documents: [{ id: "doc-own", entityType: "STARTUP", entityId: STARTUP, name: "Financials", onFile: true }] });
    const row = await t.svc.submit(STARTUP, founder, { ...revenue, supportingDocumentId: "doc-own", supportingDocumentType: "FINANCIAL_STATEMENT" });
    await t.svc.review(row.id, admin, "VERIFY", { documentValidated: true });
    expect(t.evidenceRepo.rows[0]).toMatchObject({ sourceType: HistoricalEvidenceSourceType.VERIFIED_DOCUMENT, sourceDocumentId: "doc-own" });
  });
  it("documentValidated is refused when there is no supporting document", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, revenue);
    await expect(t.svc.review(row.id, admin, "VERIFY", { documentValidated: true })).rejects.toThrow(/supporting document/);
  });
  it("a conflicting existing value is PRESERVED: both sides become CONFLICT, nothing is overwritten", async () => {
    const existing = { id: "old-1", startupId: STARTUP, fieldKey: "annualRevenue", valueNumeric: 900_000, effectiveDate: "2023-12-31", status: EvidenceStatus.NO_CONFLICT, sourceType: HistoricalEvidenceSourceType.PUBLIC_NEWS_SOURCE, verified: false };
    const t = setup({ evidence: [existing] });
    const row = await t.svc.submit(STARTUP, founder, revenue);
    const detail = await t.svc.detail(row.id);
    expect(detail.conflicts).toEqual([expect.objectContaining({ fieldKey: "annualRevenue", existingValue: 900_000, newValue: 1_600_000 })]);
    const { conflictsCreated } = await t.svc.review(row.id, admin, "VERIFY");
    expect(conflictsCreated).toBe(1);
    expect(t.evidenceRepo.rows).toHaveLength(2);
    expect(t.evidenceRepo.rows.map((r) => r.valueNumeric).sort((x, y) => x - y)).toEqual([900_000, 1_600_000]);
    expect(t.evidenceRepo.rows.every((r) => r.status === EvidenceStatus.CONFLICT)).toBe(true);
  });
  it("GMV approval writes no feature evidence at all (GMV is not revenue)", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, { kind: K.REVENUE, entry: { ...revenue.entry, revenueType: "GMV" } });
    await t.svc.review(row.id, admin, "VERIFY");
    expect(t.evidenceRepo.rows).toHaveLength(0);
  });
  it("approved NOT_APPLICABLE becomes an ADMIN_ENTERED, verified applicability row with the reason and effective date", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, { kind: K.REGULATORY_APPLICABILITY, entry: { answer: "NO", asOfDate: "2024-01-01", reason: "Pure marketplace; no regulated product." } });
    await t.svc.review(row.id, admin, "VERIFY");
    const a = t.applicabilityRepo.rows[0];
    expect(a).toMatchObject({ featureKey: "regulatoryMilestone", status: FeatureApplicabilityStatus.NOT_APPLICABLE, effectiveDate: "2024-01-01", source: ScoreDataSource.ADMIN_ENTERED, verified: true, submissionId: row.id });
    // dated: does not leak backward
    expect(resolveApplicability(t.applicabilityRepo.rows as any, "regulatoryMilestone", "2023-12-31")).toBe(FeatureApplicabilityStatus.UNKNOWN);
    expect(resolveApplicability(t.applicabilityRepo.rows as any, "regulatoryMilestone", "2024-06-30")).toBe(FeatureApplicabilityStatus.NOT_APPLICABLE);
  });
  it("a founder career entry becomes career anchors with future years excluded for earlier snapshots", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, { kind: K.FOUNDER_CAREER, entry: { founderName: "A. Founder", careerStartYear: 2012 } });
    await t.svc.review(row.id, admin, "VERIFY");
    expect(t.careers.rows[0]).toMatchObject({ startupId: STARTUP, careerStartYear: 2012, verified: true, source: ScoreDataSource.ADMIN_ENTERED });
    expect(deriveFounderFeatures(t.careers.rows as any, "2024-12-31").founderExperienceYears).toBe(12);
    expect(deriveFounderFeatures(t.careers.rows as any, "2011-12-31").founderExperienceYears).toBeUndefined();
  });
  it("a regulatory milestone writes the evidence AND a dated outcome event, both with ladder text", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, { kind: K.REGULATORY_MILESTONE, entry: { milestone: "ISO 13485", asOfDate: "2024-03-01" } });
    await t.svc.review(row.id, admin, "VERIFY");
    expect(t.evidenceRepo.rows[0]).toMatchObject({ fieldKey: "regulatoryMilestone", valueText: "ISO 13485", effectiveDate: "2024-03-01" });
    expect(t.events.rows[0]).toMatchObject({ eventType: StartupOutcomeEventType.REGULATORY_MILESTONE, valueText: "ISO 13485", eventDate: "2024-03-01", source: OutcomeEventSource.ADMIN_ENTERED, verified: true });
  });
  it("an approved coverage attestation creates a per-family coverage row attributed to the founder and the reviewing admin", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, { kind: K.COVERAGE_ATTESTATION, entry: { coverageType: "FUNDING", coverageThrough: "2026-06-30", statement: "This is my complete funding history through June 2026." } });
    expect(t.coverageRepo.rows).toHaveLength(0); // pending: no effect
    await t.svc.review(row.id, admin, "VERIFY");
    expect(t.coverageRepo.rows[0]).toMatchObject({ startupId: STARTUP, coverageType: OutcomeCoverageType.FUNDING, coverageThrough: "2026-06-30", method: OutcomeCoverageMethod.FOUNDER_ATTESTED, verifiedBy: "admin-1", createdBy: "founder-1" });
  });
});

describe("admin verification — workflow", () => {
  it("REJECT and REQUEST_CORRECTION need a reason; neither writes anything", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, revenue);
    await expect(t.svc.review(row.id, admin, "REJECT")).rejects.toThrow(/say why/);
    await expect(t.svc.review(row.id, admin, "REQUEST_CORRECTION", { notes: "  " })).rejects.toThrow(/say why/);
    const sent = await t.svc.review(row.id, admin, "REQUEST_CORRECTION", { notes: "Please use the audited figure." });
    expect(sent.submission.reviewStatus).toBe(HistoricalReviewStatus.CHANGES_REQUESTED);
    expect(t.evidenceRepo.rows).toHaveLength(0);
  });
  it("after a correction request the founder revises and it returns to PENDING_REVIEW; the new values are what gets approved", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, revenue);
    await t.svc.review(row.id, admin, "REQUEST_CORRECTION", { notes: "Use the audited figure." });
    const revised = await t.svc.resubmit(STARTUP, row.id, founder, { entry: { ...revenue.entry, amount: 1_550_000 } });
    expect(revised.reviewStatus).toBe(HistoricalReviewStatus.PENDING_REVIEW);
    await t.svc.review(row.id, admin, "VERIFY");
    expect(t.evidenceRepo.rows[0].valueNumeric).toBe(1_550_000);
  });
  it("VERIFIED and REJECTED are terminal", async () => {
    const t = setup();
    const a = await t.svc.submit(STARTUP, founder, revenue);
    await t.svc.review(a.id, admin, "REJECT", { notes: "Not supported by any document." });
    await expect(t.svc.review(a.id, admin, "VERIFY")).rejects.toThrow(/cannot move/);
    await expect(t.svc.resubmit(STARTUP, a.id, founder, { entry: revenue.entry })).rejects.toThrow(/can no longer be edited/);
  });
  it("only an admin can review", async () => {
    const t = setup();
    const a = await t.svc.submit(STARTUP, founder, revenue);
    await expect(t.svc.review(a.id, { ...founder, role: UserRole.ORGANIZATION_ADMIN }, "VERIFY")).rejects.toThrow(ForbiddenException);
  });
  it("the review queue lists pending entries with the startup name", async () => {
    const t = setup();
    await t.svc.submit(STARTUP, founder, revenue);
    const q = await t.svc.queue();
    expect(q).toHaveLength(1);
    expect(q[0].startupName).toBe("Acme Health");
  });
  it("an admin entering data directly is stored ADMIN_ENTERED and verified in one step", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, admin, revenue);
    expect(row.source).toBe(ScoreDataSource.ADMIN_ENTERED);
    expect(row.reviewStatus).toBe(HistoricalReviewStatus.VERIFIED);
    expect(t.evidenceRepo.rows).toHaveLength(1);
  });
});

describe("funding rounds — duplicate detection", () => {
  const entry = { date: "2024-05-16", roundType: "Seed", amount: 2_000_000, currency: "SAR" };
  const existing = { id: "ev-1", startupId: STARTUP, eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2024-05-16", valueNumeric: 2_000_000, valueText: "Seed" };

  it("an exact duplicate of a round already on file is refused at submission", async () => {
    const t = setup({ events: [existing] });
    await expect(t.svc.submit(STARTUP, founder, { kind: K.FUNDING_ROUND, entry })).rejects.toThrow(ConflictException);
  });
  it("a nearby round is accepted for review but approval needs an explicit 'not a duplicate' confirmation", async () => {
    const t = setup({ events: [existing] });
    const row = await t.svc.submit(STARTUP, founder, { kind: K.FUNDING_ROUND, entry: { ...entry, date: "2024-06-02", amount: 2_100_000 } });
    expect((await t.svc.detail(row.id)).duplicates).toHaveLength(1);
    await expect(t.svc.review(row.id, admin, "VERIFY")).rejects.toThrow(/confirmNotDuplicate/);
    expect(t.events.rows).toHaveLength(1);
    await t.svc.review(row.id, admin, "VERIFY", { confirmNotDuplicate: true });
    expect(t.events.rows).toHaveLength(2);
  });
  it("a month-precision profile round in the same month is flagged too", async () => {
    const t = setup({ profileRounds: [{ id: "p1", startupId: STARTUP, date: "2024-05", amount: 2, round: "Seed" }] });
    const row = await t.svc.submit(STARTUP, founder, { kind: K.FUNDING_ROUND, entry });
    expect((await t.svc.detail(row.id)).duplicates).toEqual([expect.objectContaining({ source: "PROFILE_ROUND" })]);
  });
  it("an approved round is a dated FUNDING_ROUND event with the reviewer's provenance and the founder's lead investor", async () => {
    const t = setup();
    const row = await t.svc.submit(STARTUP, founder, { kind: K.FUNDING_ROUND, entry: { ...entry, leadInvestor: "Fund A" } });
    await t.svc.review(row.id, admin, "VERIFY");
    expect(t.events.rows[0]).toMatchObject({ eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2024-05-16", valueNumeric: 2_000_000, valueText: "Seed", source: OutcomeEventSource.ADMIN_ENTERED, verified: true });
    expect(t.events.rows[0].notes).toMatch(/Lead: Fund A/);
  });
});

describe("form options", () => {
  it("offers the company's own regulatory ladder only (existing values, no free text)", async () => {
    const t = setup();
    const o = await t.svc.options(STARTUP);
    expect(o.regulatoryLadder).toContain("ISO 13485");
    expect(o.regulatoryLadder).not.toContain("strategy prepared");
    expect(o.attestableFamilies).not.toContain("SURVIVAL");
  });
});
