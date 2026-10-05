import { EntityKind } from "../common/enums";
import { FeatureDerivationService } from "./feature-derivation.service";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where))),
  };
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => row[k] === v));
}

describe("FeatureDerivationService", () => {
  it("counts team size and founders, and takes the max (not sum) of founder experience years", async () => {
    const team = fakeRepo([
      { entityType: EntityKind.STARTUP, entityId: "s1", isFounder: true, experienceYears: 6, healthcareExperienceYears: 3, previousStartupExperience: false },
      { entityType: EntityKind.STARTUP, entityId: "s1", isFounder: true, experienceYears: 12, healthcareExperienceYears: undefined, previousStartupExperience: true },
      { entityType: EntityKind.STARTUP, entityId: "s1", isFounder: false, experienceYears: 20 }, // non-founder: excluded from founder aggregates
    ]);
    const rounds = fakeRepo([{ startupId: "s1" }, { startupId: "s1" }]);
    const investments = fakeRepo([
      { targetEntityType: EntityKind.STARTUP, targetEntityId: "s1", investorId: "inv-1" },
      { targetEntityType: EntityKind.STARTUP, targetEntityId: "s1", investorId: "inv-1" }, // same investor twice -> counted once
      { targetEntityType: EntityKind.STARTUP, targetEntityId: "s1", investorId: "inv-2" },
    ]);
    const svc = new FeatureDerivationService(team as any, rounds as any, investments as any);

    const out = await svc.deriveScoringFeatures("s1");
    expect(out.teamSize).toBe(3);
    expect(out.founderCount).toBe(2);
    expect(out.founderExperienceYears).toBe(12); // max across founders, not 18 (sum) or 9 (avg)
    expect(out.healthcareExperienceYears).toBe(3); // only one founder reported it
    expect(out.previousStartupExperience).toBe(true); // true from either founder wins
    expect(out.fundingRounds).toBe(2);
    expect(out.investorCount).toBe(2); // deduplicated
  });

  it("omits a key entirely rather than deriving a zero when there's nothing to count", async () => {
    const svc = new FeatureDerivationService(fakeRepo() as any, fakeRepo() as any, fakeRepo() as any);
    const out = await svc.deriveScoringFeatures("empty-startup");
    expect(out).toEqual({});
  });

  it("a reported false for previousStartupExperience is kept when it's the only answer (real information, not missing)", async () => {
    const team = fakeRepo([{ entityType: EntityKind.STARTUP, entityId: "s1", isFounder: true, previousStartupExperience: false }]);
    const svc = new FeatureDerivationService(team as any, fakeRepo() as any, fakeRepo() as any);
    const out = await svc.deriveScoringFeatures("s1");
    expect(out.previousStartupExperience).toBe(false);
  });

  describe("funding derived from the founder's own funding rounds", () => {
    const make = (rounds: Record<string, any>[], investments: Record<string, any>[] = []) =>
      new FeatureDerivationService(fakeRepo() as any, fakeRepo(rounds) as any, fakeRepo(investments) as any);

    it("totalFundingRaised is the sum of the positive reported round amounts", async () => {
      const out = await make([{ startupId: "s1", amount: 1_000_000 }, { startupId: "s1", amount: 2_500_000 }]).deriveScoringFeatures("s1");
      expect(out.totalFundingRaised).toBe(3_500_000);
      expect(out.fundingRounds).toBe(2);
    });
    it("rounds without a usable amount derive no total (never a zero or a guess)", async () => {
      const out = await make([{ startupId: "s1", amount: 0 }, { startupId: "s1", amount: null }, { startupId: "s1", amount: "n/a" }]).deriveScoringFeatures("s1");
      expect(out.totalFundingRaised).toBeUndefined();
      expect(out.fundingRounds).toBe(3);
    });
    it("distinct round leads count as investors (case-insensitive, placeholders ignored); the larger source wins, never the sum", async () => {
      const rounds = [{ startupId: "s1", lead: "Wa'ed Ventures" }, { startupId: "s1", lead: " wa'ed ventures " }, { startupId: "s1", lead: "STV" }, { startupId: "s1", lead: "N/A" }, { startupId: "s1", lead: "" }];
      expect((await make(rounds).deriveScoringFeatures("s1")).investorCount).toBe(2);
      const linked = [{ targetEntityType: EntityKind.STARTUP, targetEntityId: "s1", investorId: "a" }, { targetEntityType: EntityKind.STARTUP, targetEntityId: "s1", investorId: "b" }, { targetEntityType: EntityKind.STARTUP, targetEntityId: "s1", investorId: "c" }];
      expect((await make(rounds, linked).deriveScoringFeatures("s1")).investorCount).toBe(3);
    });
  });
});
