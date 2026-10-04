import { BadRequestException } from "@nestjs/common";
import { FeatureApplicabilityStatus, HistoricalSubmissionKind as K, OutcomeCoverageType, StartupOutcomeEventType } from "../common/enums";
import { findFundingDuplicates, plannedWrites, validateEntry, ValidationContext } from "./historical-submission.validation";
import { LADDERS } from "../scoring/engines/regulatory.engine";

const ctx: ValidationContext = { startupCategory: "MedTech", today: "2026-10-03", actor: "FOUNDER" };
const errorsOf = (fn: () => unknown): string[] => { try { fn(); } catch (e) { return ((e as BadRequestException).getResponse() as { message: string[] }).message; } return []; };

describe("validateEntry — revenue", () => {
  const fy = (over: Record<string, unknown> = {}) => ({ revenueType: "RECOGNIZED", periodStart: "2023-01-01", periodEnd: "2023-12-31", amount: 1_600_000, currency: "SAR", ...over });

  it("keeps the dated period; the effective date is the period end", () => {
    const v = validateEntry(K.REVENUE, fy(), ctx);
    expect(v.effectiveDate).toBe("2023-12-31");
    expect(v.payload).toMatchObject({ revenueType: "RECOGNIZED", periodStart: "2023-01-01", periodEnd: "2023-12-31", sarAmount: 1_600_000 });
  });
  it("rejects future periods, bad dates, negative amounts and unknown revenue types", () => {
    expect(errorsOf(() => validateEntry(K.REVENUE, fy({ periodEnd: "2027-12-31" }), ctx)).join()).toMatch(/future/);
    expect(errorsOf(() => validateEntry(K.REVENUE, fy({ periodEnd: "2023-02-30" }), ctx)).join()).toMatch(/periodEnd/);
    expect(errorsOf(() => validateEntry(K.REVENUE, fy({ amount: -1 }), ctx)).join()).toMatch(/amount/);
    expect(errorsOf(() => validateEntry(K.REVENUE, fy({ revenueType: "PROFIT" }), ctx)).join()).toMatch(/revenueType/);
    expect(errorsOf(() => validateEntry(K.REVENUE, fy({ periodStart: "2024-01-01" }), ctx)).join()).toMatch(/before periodEnd/);
  });
  it("never converts currencies: a non-SAR figure must bring its own SAR equivalent and rate source", () => {
    expect(errorsOf(() => validateEntry(K.REVENUE, fy({ currency: "USD" }), ctx)).join()).toMatch(/never converts currencies/);
    const v = validateEntry(K.REVENUE, fy({ currency: "USD", amount: 100, sarEquivalent: 375, fxSource: "SAMA 2023-12-31 rate" }), ctx);
    expect(v.payload.sarAmount).toBe(375);
  });
  it("only a full-year RECOGNIZED figure maps to annualRevenue", () => {
    const planned = plannedWrites(K.REVENUE, "2023-12-31", validateEntry(K.REVENUE, fy(), ctx).payload);
    expect(planned.evidence).toEqual([expect.objectContaining({ fieldKey: "annualRevenue", valueNumeric: 1_600_000, currency: "SAR", effectiveDate: "2023-12-31" })]);
    const quarter = plannedWrites(K.REVENUE, "2023-03-31", validateEntry(K.REVENUE, fy({ periodEnd: "2023-03-31" }), ctx).payload);
    expect(quarter.evidence).toHaveLength(0);
    expect(quarter.notes.join()).toMatch(/full-year/);
  });
  it("GMV, MRR and OTHER are stored for reference and NEVER treated as revenue; ARR is recurringRevenue, not annualRevenue", () => {
    for (const t of ["GMV", "MRR", "OTHER"]) {
      const p = plannedWrites(K.REVENUE, "2023-12-31", validateEntry(K.REVENUE, fy({ revenueType: t }), ctx).payload);
      expect(p.evidence).toHaveLength(0);
      expect(p.notes.join()).toMatch(/not used as an ML feature/);
    }
    const arr = plannedWrites(K.REVENUE, "2023-12-31", validateEntry(K.REVENUE, fy({ revenueType: "ARR" }), ctx).payload);
    expect(arr.evidence.map((e) => e.fieldKey)).toEqual(["recurringRevenue"]);
  });
});

describe("validateEntry — customers, team, career", () => {
  it("different metric types are kept as separate series: users map to activeUsers, others to customerCount tagged with their type", () => {
    const patients = plannedWrites(K.CUSTOMER_METRIC, "2024-06-30", validateEntry(K.CUSTOMER_METRIC, { metricType: "PATIENTS", asOfDate: "2024-06-30", value: 30000 }, ctx).payload);
    expect(patients.evidence[0]).toMatchObject({ fieldKey: "customerCount", valueNumeric: 30000, valueText: "PATIENTS", effectiveDate: "2024-06-30" });
    const users = plannedWrites(K.CUSTOMER_METRIC, "2024-06-30", validateEntry(K.CUSTOMER_METRIC, { metricType: "USERS", asOfDate: "2024-06-30", value: 500 }, ctx).payload);
    expect(users.evidence[0].fieldKey).toBe("activeUsers");
    expect(errorsOf(() => validateEntry(K.CUSTOMER_METRIC, { metricType: "VIBES", asOfDate: "2024-06-30", value: 5 }, ctx)).join()).toMatch(/metricType/);
    expect(errorsOf(() => validateEntry(K.CUSTOMER_METRIC, { metricType: "CUSTOMERS", asOfDate: "2024-06-30", value: 1.5 }, ctx)).join()).toMatch(/whole number/);
  });
  it("team size is dated and must be a positive whole number", () => {
    expect(validateEntry(K.TEAM_SIZE, { asOfDate: "2023-06-30", teamSize: 12 }, ctx).effectiveDate).toBe("2023-06-30");
    expect(errorsOf(() => validateEntry(K.TEAM_SIZE, { asOfDate: "2023-06-30", teamSize: 0 }, ctx)).length).toBeGreaterThan(0);
  });
  it("founder career collects start YEARS (not 'years of experience') and refuses impossible ones", () => {
    const v = validateEntry(K.FOUNDER_CAREER, { founderName: "A. Founder", careerStartYear: 2012, domainStartYear: 2015, roleHistory: [{ title: "CTO", organization: "X", startYear: 2012, endYear: 2018 }] }, ctx);
    expect(v.payload).toMatchObject({ careerStartYear: 2012, domainStartYear: 2015 });
    expect(errorsOf(() => validateEntry(K.FOUNDER_CAREER, { founderName: "A", careerStartYear: 2030 }, ctx)).join()).toMatch(/careerStartYear/);
    expect(errorsOf(() => validateEntry(K.FOUNDER_CAREER, { founderName: "A", careerStartYear: 2012, domainStartYear: 2005 }, ctx)).join()).toMatch(/domainStartYear/);
    expect(errorsOf(() => validateEntry(K.FOUNDER_CAREER, { careerStartYear: 2012 }, ctx)).join()).toMatch(/founderName/);
  });
});

describe("validateEntry — regulatory", () => {
  it("answering NO requires a real reason, and maps to NOT_APPLICABLE only with it", () => {
    expect(errorsOf(() => validateEntry(K.REGULATORY_APPLICABILITY, { answer: "NO", asOfDate: "2024-01-01" }, ctx)).join()).toMatch(/explain why/);
    expect(errorsOf(() => validateEntry(K.REGULATORY_APPLICABILITY, { answer: "NO", asOfDate: "2024-01-01", reason: "n/a" }, ctx)).join()).toMatch(/explain why/);
    const v = validateEntry(K.REGULATORY_APPLICABILITY, { answer: "NO", asOfDate: "2024-01-01", reason: "A pure marketplace with no regulated product." }, ctx);
    expect(plannedWrites(K.REGULATORY_APPLICABILITY, v.effectiveDate, v.payload).applicability).toMatchObject({ featureKey: "regulatoryMilestone", status: FeatureApplicabilityStatus.NOT_APPLICABLE });
  });
  it("YES -> APPLICABLE, UNSURE -> UNKNOWN (unsure is never turned into not-applicable)", () => {
    const map = (answer: string) => plannedWrites(K.REGULATORY_APPLICABILITY, "2024-01-01", validateEntry(K.REGULATORY_APPLICABILITY, { answer, asOfDate: "2024-01-01" }, ctx).payload).applicability?.status;
    expect(map("YES")).toBe(FeatureApplicabilityStatus.APPLICABLE);
    expect(map("UNSURE")).toBe(FeatureApplicabilityStatus.UNKNOWN);
  });
  it("a milestone must be an exact value from the company's OWN ladder; prose is rejected", () => {
    const ok = validateEntry(K.REGULATORY_MILESTONE, { milestone: "iso 13485", asOfDate: "2024-03-01" }, ctx);
    expect(ok.payload.milestone).toBe("ISO 13485"); // canonical casing from the ladder
    expect(errorsOf(() => validateEntry(K.REGULATORY_MILESTONE, { milestone: "We got our SFDA approval!", asOfDate: "2024-03-01" }, ctx)).join()).toMatch(/exactly one of the stages/);
    // a digital-health stage is not a valid MedTech milestone
    expect(errorsOf(() => validateEntry(K.REGULATORY_MILESTONE, { milestone: "strategy prepared", asOfDate: "2024-03-01" }, ctx)).length).toBeGreaterThan(0);
    const dh = validateEntry(K.REGULATORY_MILESTONE, { milestone: "strategy prepared", asOfDate: "2024-03-01" }, { ...ctx, startupCategory: "Digital Health" });
    expect(LADDERS.DIGITAL_HEALTH).toContain(dh.payload.milestone);
  });
  it("a milestone writes BOTH the feature evidence and the dated outcome event, using ladder text only; free text stays in the explanation", () => {
    const p = plannedWrites(K.REGULATORY_MILESTONE, "2024-03-01", validateEntry(K.REGULATORY_MILESTONE, { milestone: "ISO 13485", asOfDate: "2024-03-01", explanation: "Certified by BSI, certificate pending translation" }, ctx).payload);
    expect(p.evidence[0]).toMatchObject({ fieldKey: "regulatoryMilestone", valueText: "ISO 13485" });
    expect(p.event).toMatchObject({ eventType: StartupOutcomeEventType.REGULATORY_MILESTONE, valueText: "ISO 13485", eventDate: "2024-03-01" });
    expect(p.event?.notes).toMatch(/BSI/);
  });
});

describe("validateEntry — funding and coverage", () => {
  const round = (over: Record<string, unknown> = {}) => ({ date: "2024-05-16", roundType: "Seed", amount: 2_000_000, currency: "SAR", leadInvestor: "Fund A", otherInvestors: ["B", "C"], ...over });
  it("needs a FULL date — a month alone would be recorded as an exact day", () => {
    expect(errorsOf(() => validateEntry(K.FUNDING_ROUND, round({ date: "2024-05" }), ctx)).join()).toMatch(/full YYYY-MM-DD/);
  });
  it("maps to a FUNDING_ROUND event keeping the investors, and the amount is optional", () => {
    const p = plannedWrites(K.FUNDING_ROUND, "2024-05-16", validateEntry(K.FUNDING_ROUND, round(), ctx).payload);
    expect(p.event).toMatchObject({ eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2024-05-16", valueNumeric: 2_000_000, valueText: "Seed" });
    expect(p.event?.notes).toMatch(/Lead: Fund A/);
    expect(validateEntry(K.FUNDING_ROUND, { date: "2024-05-16", roundType: "Grant" }, ctx).payload.amount).toBeUndefined();
  });
  it("a founder can attest every family except SURVIVAL; an admin can attest all", () => {
    const entry = (coverageType: string) => ({ coverageType, coverageThrough: "2026-06-30", statement: "I confirm this is my complete funding history." });
    expect(validateEntry(K.COVERAGE_ATTESTATION, entry("FUNDING"), ctx).effectiveDate).toBe("2026-06-30");
    expect(errorsOf(() => validateEntry(K.COVERAGE_ATTESTATION, entry("SURVIVAL"), ctx)).join()).toMatch(/coverageType/);
    expect(validateEntry(K.COVERAGE_ATTESTATION, entry("SURVIVAL"), { ...ctx, actor: "ADMIN" }).payload.coverageType).toBe("SURVIVAL");
    expect(plannedWrites(K.COVERAGE_ATTESTATION, "2026-06-30", validateEntry(K.COVERAGE_ATTESTATION, entry("FUNDING"), ctx).payload).coverage?.coverageType).toBe(OutcomeCoverageType.FUNDING);
  });
  it("coverage cannot be attested through a future date", () => {
    expect(errorsOf(() => validateEntry(K.COVERAGE_ATTESTATION, { coverageType: "FUNDING", coverageThrough: "2027-01-01", statement: "complete through next year" }, ctx)).join()).toMatch(/future/);
  });
  it("rejects non-objects", () => expect(errorsOf(() => validateEntry(K.TEAM_SIZE, "nope", ctx))[0]).toMatch(/object/));
});

describe("findFundingDuplicates", () => {
  const events = [{ id: "e1", eventDate: "2024-05-16", valueNumeric: 2_000_000, valueText: "Seed" }];
  it("same day + same amount is EXACT (blocked)", () => {
    expect(findFundingDuplicates({ date: "2024-05-16", sarAmount: 2_000_000 }, events, [])[0].match).toBe("EXACT");
  });
  it("a round within a month is NEARBY (flagged), a distant one is not", () => {
    expect(findFundingDuplicates({ date: "2024-06-01", sarAmount: 3_000_000 }, events, [])[0].match).toBe("NEARBY");
    expect(findFundingDuplicates({ date: "2025-05-16", sarAmount: 2_000_000 }, events, [])).toHaveLength(0);
  });
  it("a profile round in the same month is flagged against the month-precision profile table", () => {
    const d = findFundingDuplicates({ date: "2024-05-20", sarAmount: 1 }, [], [{ id: "p1", date: "2024-05", amount: 2, round: "Seed" }]);
    expect(d).toEqual([expect.objectContaining({ source: "PROFILE_ROUND", match: "NEARBY" })]);
  });
});
