import { ScoreStatus, ScoreTrigger } from "../common/enums";
import { StartupsService } from "./startups.service";
import { ScoringService } from "../scoring/scoring.service";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => rows.find((r) => matches(r, opts.where)) ?? null),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
    update: jest.fn(async (id: string, patch: any) => { const r = rows.find((x: any) => x.id === id); if (r) Object.assign(r, patch); }),
  };
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => row[k] === v));
}

/** Guards the fix for the exposure gap found in the RUWĀD Score research
 * pass: GET /startups/:slug is a fully public route, and toDetail() is what
 * it returns — the old `sub` object put six raw hardcoded-70 columns on
 * the wire with no gating at all. The new per-factor `reason`/
 * `inputsUsed`/`missingInputs` and feature-level provenance must never
 * appear in that same public payload — they're admin-only, served solely
 * through ScoringController. */
describe("StartupsService.toDetail — public payload never leaks admin-only scoring detail", () => {
  it("includes the composite score/status/confidence but not per-factor reasons or inputs", async () => {
    const startup = { id: "s1", name: "Nala Health", verified: "unclaimed", fundingTotal: 10, valuation: 0, ruwadScore: 8.1, scoreStatus: ScoreStatus.CALCULATED, scoreConfidence: 0.9, scoreVersion: "RUWAD-2.0" };
    const startupsRepo = fakeRepo([startup]);
    const shared = {
      getSectorNames: jest.fn(async () => []), getTeamMembers: jest.fn(async () => []),
      getProducts: jest.fn(async () => []), getContact: jest.fn(async () => null),
    };
    const investments = { findForTarget: jest.fn(async () => []) };
    const organizations = { pendingClaimForEntity: jest.fn(async () => false) };
    const scoring = {
      getScoreForStartup: jest.fn(async () => ({
        status: ScoreStatus.CALCULATED, ruwadScore: 8.1, confidenceScore: 0.9, version: "RUWAD-2.0", calculatedAt: new Date().toISOString(),
        missingFactors: [],
        factors: {
          growth: { score: 8, confidence: 0.9, reason: "Strong reported revenue growth over the latest quarter — internal detail.", inputsUsed: ["quarterlyRevenueGrowth"], missingInputs: [] },
          financial: { score: 7, confidence: 0.8, reason: "internal", inputsUsed: [], missingInputs: [] },
          market: { score: 8, confidence: 0.85, reason: "internal", inputsUsed: [], missingInputs: [] },
          team: { score: 9, confidence: 0.95, reason: "internal", inputsUsed: [], missingInputs: [] },
          regulatory: { score: 6, confidence: 0.7, reason: "internal", inputsUsed: [], missingInputs: [] },
          technology: { score: 9, confidence: 0.92, reason: "internal", inputsUsed: [], missingInputs: [] },
        },
      })),
    } as unknown as ScoringService;

    const svc = new StartupsService(startupsRepo as any, fakeRepo() as any, fakeRepo() as any, shared as any, investments as any, organizations as any, scoring);
    const detail = await svc.toDetail(startup as any);
    const json = JSON.stringify(detail);

    expect(detail.ruwadScore).toBe(8.1);
    expect(detail.scoreStatus).toBe(ScoreStatus.CALCULATED);
    expect(detail.scoreConfidence).toBe(0.9);
    expect((detail as any).factors.growth.score).toBe(8);
    expect((detail as any).factors.growth.confidence).toBe(0.9);

    // The admin-only fields must not appear anywhere in the serialized public payload.
    expect(json).not.toMatch(/reason/i);
    expect(json).not.toMatch(/inputsUsed/i);
    expect(json).not.toMatch(/missingInputs/i);
    expect((detail as any).factors.growth.reason).toBeUndefined();
    expect((detail as any).factors.growth.inputsUsed).toBeUndefined();
  });

  it("never exposes internal ML data-quality metadata (founding-year basis) on the public profile", async () => {
    const startup = { id: "s1", name: "Karaz", verified: "unclaimed", fundingTotal: 0, valuation: 0, founded: 2020, foundedBasis: "ESTIMATED", ruwadScore: null, scoreStatus: ScoreStatus.NOT_CALCULATED };
    const shared = { getSectorNames: jest.fn(async () => []), getTeamMembers: jest.fn(async () => []), getProducts: jest.fn(async () => []), getContact: jest.fn(async () => null) };
    const scoring = { getScoreForStartup: jest.fn(async () => ({ status: ScoreStatus.NOT_CALCULATED, ruwadScore: null, confidenceScore: null, version: "RUWAD-2.0", calculatedAt: new Date().toISOString(), missingFactors: [], factors: {} })) } as unknown as ScoringService;
    const svc = new StartupsService(fakeRepo([startup]) as any, fakeRepo() as any, fakeRepo() as any, shared as any, { findForTarget: jest.fn(async () => []) } as any, { pendingClaimForEntity: jest.fn(async () => false) } as any, scoring);
    const detail = await svc.toDetail(startup as any);
    expect(detail.founded).toBe(2020); // the public year is unchanged
    expect(JSON.stringify(detail)).not.toMatch(/foundedBasis/);
  });

  it("create() never sets a score itself — it delegates to ScoringService", async () => {
    const startupsRepo = fakeRepo();
    const shared = { setSectors: jest.fn(), setTeamMembers: jest.fn(), setDocuments: jest.fn(), setProducts: jest.fn() };
    const scoring = { recalculateStartupScore: jest.fn(async () => undefined) } as unknown as ScoringService;
    const svc = new StartupsService(startupsRepo as any, fakeRepo() as any, fakeRepo() as any, shared as any, { findForTarget: jest.fn() } as any, {} as any, scoring);

    const dto = { name: "New Co", category: "Digital Health", subsector: "x", tagline: "x", country: "SA", city: "Riyadh", hq: "Riyadh", founded: 2024, stage: "Seed", businessModel: "B2B", employees: 3, fundingTotal: 0, valuation: 0, desc: "x", problem: "x", solution: "x", advantage: "x", sfda: "N/A", fda: "N/A", ce: "N/A", clinicalStatus: "N/A", patentStatus: "N/A", marketTam: "", marketSam: "", marketSom: "", legalName: "New Co", website: "", email: "", phone: "", linkedin: "" };
    const saved = await svc.create(dto as any);

    expect(saved).not.toHaveProperty("score");
    expect(saved).not.toHaveProperty("scoreGrowth");
    expect((scoring.recalculateStartupScore as jest.Mock)).toHaveBeenCalledWith(saved.id, ScoreTrigger.STARTUP_CREATED);
  });
});
