import { buildHubContext, buildInvestorContext, buildMultinationalContext, buildStartupContext, clean, hasEnoughData, sourceFingerprint } from "./ai-summary-context";

const startup = {
  name: "Gees Health", category: "Diagnostics", subsector: "Women's health", tagline: "At-home hormone monitoring", city: "Riyadh", country: "Saudi Arabia", hq: "Riyadh, Saudi Arabia",
  founded: 2026, foundedBasis: "KNOWN", stage: "Pre-Seed", status: "Active", businessModel: "Kit plus subscription", employees: 3, fundingTotal: 0,
  desc: "Saliva-based hormone testing with AI analytics delivered through an app for continuous insight.", problem: "Hormone testing needs clinic visits.", solution: "At-home saliva kit.",
  advantage: "—", sfda: "Not publicly disclosed", fda: "Breakthrough Device Designation", ce: "—", clinicalStatus: "—", patentStatus: "—",
  marketTam: "—", marketSam: "—", provenanceSources: ["Company website"], provenanceConfidence: "Medium", provenanceLastUpdated: "2026-10-07",
  // fields that must never be read:
  email: "founder@secret.test", phone: "+966500000000", registrationNumber: "CR-123", legalName: "Gees Health LLC", valuation: 99, ruwadScore: 1.9,
};

describe("clean", () => {
  it("treats the platform's 'unknown' markers as missing", () => {
    for (const v of ["", "—", "N/A", "Not publicly disclosed", "  tbd ", "Unknown", "not disclosed"]) expect(clean(v)).toBeUndefined();
    expect(clean("  Riyadh   hub ")).toBe("Riyadh hub");
    expect(clean(5)).toBeUndefined();
  });
});

describe("buildStartupContext", () => {
  const ctx = buildStartupContext(startup, { sectors: ["Diagnostics", "Digital Health"] });

  it("keeps only real facts and never sends zero for unknown numbers", () => {
    expect(ctx.facts.totalFundingSarMillions).toBeUndefined();
    expect(ctx.facts.employees).toBe(3);
    expect(ctx.facts.competitiveAdvantage).toBeUndefined();
    expect(ctx.facts.sfda).toBeUndefined();
  });

  it("passes a designation through verbatim, without turning it into an approval", () => {
    expect(JSON.stringify(ctx.facts)).toContain("Breakthrough Device Designation");
    expect(JSON.stringify(ctx.facts)).not.toMatch(/approved|cleared/i);
  });

  it("never includes contact details, registration numbers, valuation or the RUWĀD score", () => {
    const json = JSON.stringify(ctx.facts);
    for (const secret of ["founder@secret.test", "+966500000000", "CR-123", "Gees Health LLC", "99", "1.9"]) expect(json).not.toContain(secret);
  });

  it("carries provenance separately from the AI input", () => {
    expect(ctx.provenance).toEqual({ sources: ["Company website"], confidence: "Medium", lastUpdated: "2026-10-07" });
    expect(JSON.stringify(ctx.facts)).not.toContain("Company website");
  });

  it("does not claim a founding year that is only an estimate", () => {
    expect(buildStartupContext({ ...startup, foundedBasis: "ESTIMATED" }).facts.foundedYear).toBeUndefined();
  });
});

describe("other entity types", () => {
  it("investor: thesis, stages, sectors and ticket; zero counts are dropped", () => {
    const ctx = buildInvestorContext({ name: "Nama Ventures", type: "VC", city: "Riyadh", founded: 2018, desc: "Early-stage fund.", thesis: "Backs digital health founders in the Kingdom.", stageFocus: ["Pre-Seed", "Seed"], ticket: "$250K-$1M", aum: "Not publicly disclosed", investments: 0, exits: 0, hcDeals: 4 }, { sectors: ["Digital Health"] });
    expect(ctx.facts).toMatchObject({ investorType: "VC", investmentStages: ["Pre-Seed", "Seed"], typicalTicketSize: "$250K-$1M", preferredSectors: ["Digital Health"], healthcareDeals: 4 });
    expect(ctx.facts.numberOfInvestments).toBeUndefined();
    expect(ctx.facts.assetsUnderManagement).toBeUndefined();
  });

  it("hub: programs and support are included", () => {
    const ctx = buildHubContext({ name: "KAUST Taqadam", type: "Accelerator", city: "Thuwal", country: "Saudi Arabia", desc: "Accelerator for deep-tech startups.", about: "Runs cohorts.", support: ["Mentorship", "Lab access"], stagesSupported: [] }, { programs: [{ name: "Cohort 3", type: "Accelerator", status: "Open", duration: "6 months" }] });
    expect(ctx.facts).toMatchObject({ organizationType: "Accelerator", supportOffered: ["Mentorship", "Lab access"] });
    expect(ctx.facts.stagesSupported).toBeUndefined();
    expect((ctx.facts.programs as unknown[]).length).toBe(1);
  });

  it("multinational: presence, products and partnerships", () => {
    const ctx = buildMultinationalContext(
      { name: "Siemens Healthineers", category: "Medical Devices", tagline: "Imaging and diagnostics", desc: "Regional headquarters in Riyadh.", hq: "Erlangen, Germany", employees: 0, saudiOffice: true, distribution: false, manufacturing: false, countriesActiveIn: ["Saudi Arabia", "UAE"], rdCenters: 0 },
      { products: [{ name: "MAGNETOM", category: "MRI" }], partnerships: [{ partnerName: "Ministry of Health", type: "Government" }] },
    );
    expect(ctx.facts.saudiAndMenaPresence).toEqual({ saudiOffice: true, countriesActiveIn: ["Saudi Arabia", "UAE"] });
    expect(ctx.facts.employees).toBeUndefined();
    expect(ctx.facts.partnerships).toEqual([{ partner: "Ministry of Health", type: "Government" }]);
  });
});

describe("hasEnoughData", () => {
  it("is true with a real description", () => expect(hasEnoughData(buildStartupContext(startup))).toBe(true));
  it("is false when there is nothing descriptive to summarize", () => {
    const thin = buildStartupContext({ name: "Empty Co", category: "MedTech", tagline: "—", desc: "—", problem: "—", solution: "—", advantage: "—", city: "Riyadh", country: "KSA", hq: "—", stage: "Seed", status: "Active", founded: 2024, employees: 0, fundingTotal: 0 });
    expect(hasEnoughData(thin)).toBe(false);
  });
});

describe("sourceFingerprint", () => {
  it("is stable for identical data regardless of key order", () => {
    expect(sourceFingerprint({ a: 1, b: { x: 1, y: 2 } }, "v1")).toBe(sourceFingerprint({ b: { y: 2, x: 1 }, a: 1 }, "v1"));
  });
  it("changes when the data or the prompt version changes", () => {
    const base = sourceFingerprint({ a: 1 }, "v1");
    expect(sourceFingerprint({ a: 2 }, "v1")).not.toBe(base);
    expect(sourceFingerprint({ a: 1 }, "v2")).not.toBe(base);
  });
});
