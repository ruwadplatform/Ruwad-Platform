import { extractStartupScoringFeatures } from "./startup-submission.publisher";

describe("extractStartupScoringFeatures", () => {
  it("splits keys by aiFilledKeys membership: untouched AI extractions go to aiPatch, everything else to founderPatch", () => {
    const payload = { customerCount: 40, teamSize: 8, quarterlyRevenueGrowth: 15 };
    const { founderPatch, aiPatch } = extractStartupScoringFeatures(payload, new Set(["customerCount"]));
    expect(aiPatch).toEqual({ customerCount: 40 });
    expect(founderPatch).toEqual({ teamSize: 8, quarterlyRevenueGrowth: 15 });
  });

  it("treats every key as founder-submitted when no aiFilledKeys set is given", () => {
    const { founderPatch, aiPatch } = extractStartupScoringFeatures({ teamSize: 5 });
    expect(founderPatch).toEqual({ teamSize: 5 });
    expect(aiPatch).toEqual({});
  });

  it("never invents a value for a field simply absent from the payload", () => {
    const { founderPatch, aiPatch } = extractStartupScoringFeatures({ name: "Nala Health" });
    expect(founderPatch).toEqual({});
    expect(aiPatch).toEqual({});
  });

  it("derives geographicExpansion from the marketsOperatingIn array's length, tagged by that key's own AI-filled membership", () => {
    const founderTyped = extractStartupScoringFeatures({ marketsOperatingIn: ["Saudi Arabia", "UAE", "Qatar"] });
    expect(founderTyped.founderPatch.geographicExpansion).toBe(3);
    expect(founderTyped.aiPatch.geographicExpansion).toBeUndefined();

    const aiFilled = extractStartupScoringFeatures({ marketsOperatingIn: ["Saudi Arabia"] }, new Set(["marketsOperatingIn"]));
    expect(aiFilled.aiPatch.geographicExpansion).toBe(1);
  });

  it("an empty markets array contributes nothing rather than a false zero", () => {
    const { founderPatch, aiPatch } = extractStartupScoringFeatures({ marketsOperatingIn: [] });
    expect(founderPatch.geographicExpansion).toBeUndefined();
    expect(aiPatch.geographicExpansion).toBeUndefined();
  });

  it("resolves the technologyReadinessLevel friendly label back to its numeric 1-9 level", () => {
    const { founderPatch } = extractStartupScoringFeatures({ technologyReadinessLevel: "Experimental proof of concept" });
    expect(founderPatch.technologyReadinessLevel).toBe(3);
  });

  it("ignores an unrecognized technologyReadinessLevel label rather than guessing a level", () => {
    const { founderPatch, aiPatch } = extractStartupScoringFeatures({ technologyReadinessLevel: "somewhere in the middle" });
    expect(founderPatch.technologyReadinessLevel).toBeUndefined();
    expect(aiPatch.technologyReadinessLevel).toBeUndefined();
  });

  it("boolean and regulatoryMilestone fields split the same way as numeric ones", () => {
    const { founderPatch, aiPatch } = extractStartupScoringFeatures(
      { proprietaryTechnology: true, clinicalValidation: false, regulatoryMilestone: "SFDA submission" },
      new Set(["clinicalValidation"]),
    );
    expect(founderPatch.proprietaryTechnology).toBe(true);
    expect(founderPatch.regulatoryMilestone).toBe("SFDA submission");
    expect(aiPatch.clinicalValidation).toBe(false);
  });

  describe("the required Employees headcount becomes the structured teamSize input", () => {
    it("a positive headcount maps to teamSize, tagged founder-typed unless it is still an untouched AI extraction", () => {
      expect(extractStartupScoringFeatures({ employees: 24 }).founderPatch.teamSize).toBe(24);
      const ai = extractStartupScoringFeatures({ employees: 24 }, new Set(["employees"]));
      expect(ai.aiPatch.teamSize).toBe(24);
      expect(ai.founderPatch.teamSize).toBeUndefined();
    });
    it("0 (how an unanswered form looks), blanks and junk are NOT turned into a team of zero", () => {
      for (const employees of [0, "", null, undefined, "many", -3]) {
        const { founderPatch, aiPatch } = extractStartupScoringFeatures({ employees });
        expect(founderPatch.teamSize).toBeUndefined();
        expect(aiPatch.teamSize).toBeUndefined();
      }
    });
    it("an explicitly provided teamSize is never overridden by the headcount", () => {
      expect(extractStartupScoringFeatures({ employees: 24, teamSize: 8 }).founderPatch.teamSize).toBe(8);
    });
  });
});
