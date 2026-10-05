import { startupSubmissionProblems } from "./startup-submission-requirements";

const complete = (over: Record<string, unknown> = {}) => ({
  category: "Digital Health",
  founders: [{ name: "Sara Alharbi", title: "CEO", isFounder: true }],
  annualRevenue: 0, previousAnnualRevenue: 0, recurringRevenue: 0, customerCount: 3, previousCustomerCount: 1, activeUsers: 120, partnershipsCount: 0, monthlyBurn: 0, cashAvailable: 0,
  patentsGranted: 0, patentsPending: 0, regulatoryMilestone: "MVP",
  contactName: "Sara Alharbi", contactEmail: "sara@example.com", contactPhone: "+966500000000", contactLinkedin: "https://linkedin.com/in/sara",
  ...over,
});

describe("startupSubmissionProblems", () => {
  it("accepts a complete submission, including zeros as real answers", () => {
    expect(startupSubmissionProblems(complete())).toEqual([]);
  });

  it("requires at least one team member", () => {
    expect(startupSubmissionProblems(complete({ founders: [] }))).toEqual(["Add at least one team member (Founders & Team)."]);
    expect(startupSubmissionProblems(complete({ founders: undefined }))).toHaveLength(1);
    expect(startupSubmissionProblems(complete({ founders: [{ title: "CEO" }] }))).toHaveLength(1); // nameless card does not count
  });

  it("counts a member listed under teamMembers", () => {
    expect(startupSubmissionProblems(complete({ founders: [], teamMembers: [{ name: "Omar", title: "CTO" }] }))).toEqual([]);
  });

  it("requires every Traction & Growth field, but a blank is not the same as 0", () => {
    const keys = ["annualRevenue", "previousAnnualRevenue", "recurringRevenue", "customerCount", "previousCustomerCount", "activeUsers", "partnershipsCount", "monthlyBurn", "cashAvailable"];
    for (const k of keys) {
      const problems = startupSubmissionProblems(complete({ [k]: undefined }));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("Traction & Growth");
    }
    expect(startupSubmissionProblems(complete({ annualRevenue: "" }))).toHaveLength(1);
    expect(startupSubmissionProblems(complete({ annualRevenue: -5 }))).toHaveLength(1);
  });

  it("does not ask for fields the category never shows", () => {
    // therapeutics have no recurring revenue; only digital-health-like categories have active users
    expect(startupSubmissionProblems(complete({ category: "Biotechnology", recurringRevenue: undefined, activeUsers: undefined }))).toEqual([]);
    expect(startupSubmissionProblems(complete({ category: "Biotechnology", activeUsers: undefined }))).toEqual([]);
    expect(startupSubmissionProblems(complete({ category: "MedTech", activeUsers: undefined }))).toEqual([]);
    expect(startupSubmissionProblems(complete({ category: "MedTech", recurringRevenue: undefined }))).toHaveLength(1);
    expect(startupSubmissionProblems(complete({ category: "Telemedicine", activeUsers: undefined }))).toHaveLength(1);
  });

  it("requires patents granted, patents pending and regulatory strategy status", () => {
    expect(startupSubmissionProblems(complete({ patentsGranted: undefined }))).toHaveLength(1);
    expect(startupSubmissionProblems(complete({ patentsPending: undefined }))).toHaveLength(1);
    expect(startupSubmissionProblems(complete({ regulatoryMilestone: "  " }))).toHaveLength(1);
    expect(startupSubmissionProblems(complete({ regulatoryMilestone: undefined }))).toHaveLength(1);
  });

  it("requires all four primary contact details", () => {
    for (const k of ["contactName", "contactEmail", "contactPhone", "contactLinkedin"]) {
      expect(startupSubmissionProblems(complete({ [k]: "" }))).toHaveLength(1);
      expect(startupSubmissionProblems(complete({ [k]: undefined }))).toHaveLength(1);
    }
  });

  it("lists every problem at once for an empty payload", () => {
    expect(startupSubmissionProblems({}).length).toBeGreaterThanOrEqual(15);
  });
});
