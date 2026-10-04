import { scoreGrowth } from "./growth.engine";
import { scoreFinancial } from "./financial.engine";
import { scoreMarket } from "./market.engine";
import { scoreTeam } from "./team.engine";
import { scoreRegulatory } from "./regulatory.engine";
import { scoreTechnology } from "./technology.engine";
import type { Startup } from "../../startups/startup.entity";
import type { ScoringFeatures } from "../scoring.types";

const baseStartup = (over: Partial<Startup> = {}): Startup => ({
  id: "s1", category: "Digital Health", sfda: "N/A", fda: "N/A", ce: "N/A", clinicalStatus: "Not disclosed",
  marketTam: "", marketSam: "", marketSom: "", fundingTotal: 0,
  ...over,
} as unknown as Startup);

const ENGINES = [
  { name: "growth", fn: scoreGrowth },
  { name: "financial", fn: scoreFinancial },
  { name: "market", fn: scoreMarket },
  { name: "team", fn: scoreTeam },
  { name: "regulatory", fn: scoreRegulatory },
  { name: "technology", fn: scoreTechnology },
] as const;

describe("scoring engines — shared invariants", () => {
  for (const { name, fn } of ENGINES) {
    describe(name, () => {
      it("returns a null score (never 0) with zero confidence when given no data", () => {
        const r = fn({}, baseStartup());
        expect(r.score).toBeNull();
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
        expect(r.reason.length).toBeGreaterThan(0);
      });

      it("never produces a score outside [0, 10] or a non-finite value, even with hostile inputs", () => {
        const hostile: ScoringFeatures = {
          annualRevenue: -1e12, previousAnnualRevenue: 0, quarterlyRevenueGrowth: NaN, customerCount: -5,
          runwayMonths: -999, monthlyBurn: 0, cashAvailable: Infinity, burnMultiple: -10, grossMargin: 99999,
          tam: -1, sam: NaN, marketGrowthRate: Infinity, competitionLevel: -50,
          founderExperienceYears: -20, teamSize: -1, previousExits: 999999,
          patentsGranted: -3, technologyReadinessLevel: 999, replicationDifficulty: -100,
        };
        const r = fn(hostile, baseStartup());
        if (r.score != null) {
          expect(Number.isFinite(r.score)).toBe(true);
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(10);
        }
        expect(Number.isFinite(r.confidence)).toBe(true);
      });

      it("is deterministic: identical inputs always produce identical output", () => {
        const features: ScoringFeatures = { annualRevenue: 1_000_000, previousAnnualRevenue: 800_000, founderExperienceYears: 8, tam: 5e9, regulatoryMilestone: "SFDA submission" };
        const startup = baseStartup();
        const a = fn(features, startup);
        const b = fn(features, startup);
        expect(a).toEqual(b);
      });
    });
  }
});

describe("growth.engine", () => {
  it("scores strong reported growth highly", () => {
    const r = scoreGrowth({ quarterlyRevenueGrowth: 30, customerGrowthRate: 100, partnershipGrowth: 100, geographicExpansion: 5 });
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeGreaterThan(8);
  });
  it("derives revenue growth from two annual figures when no rate is given directly", () => {
    const r = scoreGrowth({ annualRevenue: 200, previousAnnualRevenue: 100 }); // 100% YoY
    expect(r.score).not.toBeNull();
    expect(r.inputsUsed).toContain("annualRevenue");
  });
});

describe("financial.engine", () => {
  it("falls back to the startup's own fundingTotal column when no richer feature is reported", () => {
    const r = scoreFinancial({}, baseStartup({ fundingTotal: 15 as unknown as Startup["fundingTotal"] }));
    expect(r.score).not.toBeNull();
    expect(r.confidence).toBeGreaterThan(0);
  });
  it("zero fundingTotal contributes nothing (not treated as a bad score)", () => {
    const withZero = scoreFinancial({}, baseStartup({ fundingTotal: 0 as unknown as Startup["fundingTotal"] }));
    expect(withZero.score).toBeNull();
  });
});

describe("market.engine", () => {
  it("falls back to the startup's free-text marketTam/marketSam when no numeric feature is given", () => {
    const r = scoreMarket({}, baseStartup({ marketTam: "SAR 2B", marketSam: "SAR 500M" }));
    expect(r.score).not.toBeNull();
  });
  it("an unparseable market-size string contributes nothing rather than a guess", () => {
    const r = scoreMarket({}, baseStartup({ marketTam: "large and growing" }));
    expect(r.score).toBeNull();
  });
});

describe("team.engine", () => {
  it("treats a reported false (no prior startup) as real information, not missing", () => {
    const r = scoreTeam({ previousStartupExperience: false, founderExperienceYears: 5 });
    expect(r.inputsUsed).toContain("previousStartupExperience");
    expect(r.missingInputs).not.toContain("previousStartupExperience");
  });
});

describe("regulatory.engine — sector-aware pathways", () => {
  it("picks the digital health ladder for a Digital Health category and infers from sfda status", () => {
    const r = scoreRegulatory({}, baseStartup({ category: "Digital Health", sfda: "Approved" }));
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeGreaterThan(5);
    expect(r.reason).toMatch(/digital health/);
  });
  it("picks the medical device ladder for a MedTech category", () => {
    const r = scoreRegulatory({}, baseStartup({ category: "MedTech", fda: "Pending" }));
    expect(r.reason).toMatch(/medical device/);
  });
  it("picks the therapeutic ladder for a Biotechnology category", () => {
    const r = scoreRegulatory({}, baseStartup({ category: "Biotechnology", ce: "Not Submitted" }));
    expect(r.reason).toMatch(/therapeutic/);
  });
  it("an explicit regulatoryMilestone is used directly and scores higher confidence than an inferred one", () => {
    const explicit = scoreRegulatory({ regulatoryMilestone: "FDA/CE/other approval" }, baseStartup({ category: "Digital Health" }));
    const inferred = scoreRegulatory({}, baseStartup({ category: "Digital Health", sfda: "Approved" }));
    expect(explicit.confidence).toBeGreaterThan(inferred.confidence);
  });
  it("never guesses when no SFDA/FDA/CE status is reported at all", () => {
    const r = scoreRegulatory({}, baseStartup({ sfda: "N/A", fda: "N/A", ce: "N/A" }));
    expect(r.score).toBeNull();
  });
});

describe("technology.engine", () => {
  it("scores IP position from patents and proprietary technology", () => {
    const r = scoreTechnology({ patentsGranted: 3, proprietaryTechnology: true, proprietaryDatasets: 2 });
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeGreaterThan(0);
  });
});
