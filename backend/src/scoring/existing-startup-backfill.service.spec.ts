import { In } from "typeorm";
import { ValidationPipe } from "@nestjs/common";
import { EntityKind, EvidenceStatus, HistoricalEvidenceSourceType, ScoreDataSource, ScoreStatus, ScoreTrigger, SubmissionStatus, UserRole } from "../common/enums";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, ML_WEIGHT, RULE_WEIGHT } from "./scoring.constants";
import { ScoringAdminController } from "./scoring.controller";
import { BackfillExistingStartupsDto } from "./dto/backfill-existing.dto";
import { ExistingStartupBackfillService, selectEvidenceFeatures } from "./existing-startup-backfill.service";
import { FeatureDerivationService } from "./feature-derivation.service";
import { InMemoryTable } from "./in-memory-table";
import { ScoringService } from "./scoring.service";

const startupRow = (id: string, over: Record<string, any> = {}) => ({
  id, name: `Startup ${id}`, slug: `startup-${id}`, category: "Digital Health", employees: 0, fundingTotal: 0, marketTam: "Not publicly disclosed", marketSam: "Not publicly disclosed", marketSom: "Not publicly disclosed",
  sfda: "Not Submitted", fda: "N/A", ce: "N/A", scoreStatus: ScoreStatus.NOT_CALCULATED, ruwadScore: null, ...over,
});

/** A startup with everything the platform could hold: team, rounds, headcount, market sizes, and an approved submission carrying traction and technology. */
const RICH = {
  startup: startupRow("rich", { employees: 24, fundingTotal: 3.5, marketTam: "SAR 2B", marketSam: "SAR 500M", marketSom: "SAR 50M", sfda: "Approved" }),
  team: [
    { entityType: EntityKind.STARTUP, entityId: "rich", isFounder: true, experienceYears: 11, healthcareExperienceYears: 7, previousStartupExperience: true },
    { entityType: EntityKind.STARTUP, entityId: "rich", isFounder: true, experienceYears: 9, healthcareExperienceYears: 4, previousStartupExperience: false },
  ],
  rounds: [{ startupId: "rich", amount: 1_000_000, lead: "Angel Network" }, { startupId: "rich", amount: 2_500_000, lead: "Wa'ed Ventures" }],
  payload: {
    annualRevenue: 1_200_000, previousAnnualRevenue: 600_000, recurringRevenue: 900_000, customerCount: 40, previousCustomerCount: 20, activeUsers: 12_000, partnershipsCount: 4, monthlyBurn: 150_000, cashAvailable: 1_200_000,
    marketGrowthRate: 18, marketsOperatingIn: ["Saudi Arabia", "United Arab Emirates"], proprietaryTechnology: true, proprietaryAlgorithms: 2, proprietaryDatasets: 1, peerReviewedPublications: 3, patentsGranted: 1, patentsPending: 2,
    sfda: "Approved", regulatoryMilestone: "Deployed in Pilot Environments", aiFilledScoringKeys: [],
  },
};

function setup(opts: { startups: any[]; team?: any[]; rounds?: any[]; evidence?: any[]; submissions?: any[]; features?: any[]; history?: any[] }) {
  const t = {
    startups: new InMemoryTable(opts.startups), team: new InMemoryTable(opts.team), rounds: new InMemoryTable(opts.rounds), investments: new InMemoryTable(),
    features: new InMemoryTable(opts.features), history: new InMemoryTable(opts.history), audit: new InMemoryTable(), evidence: new InMemoryTable(opts.evidence), submissions: new InMemoryTable(opts.submissions),
  };
  const experimental = { onFeaturesChanged: jest.fn(async () => undefined) };
  const scoring = new ScoringService(
    t.startups as any, t.history as any, t.features as any, t.audit as any, { predict: async () => null } as any, new FeatureDerivationService(t.team as any, t.rounds as any, t.investments as any),
    { maybeSnapshot: async () => null } as any, { createSystemEventIfNew: async () => null } as any, { generateShadowPredictions: async () => undefined } as any, experimental as any,
  );
  const svc = new ExistingStartupBackfillService(t.startups as any, t.team as any, t.rounds as any, t.investments as any, t.features as any, t.history as any, t.evidence as any, t.submissions as any, scoring);
  const writes = ["startups", "history", "features", "audit"].flatMap((k) => (["save", "update", "create"] as const).map((m) => jest.spyOn((t as any)[k], m)));
  return { t, svc, scoring, experimental, writeSpies: writes, calls: () => writes.reduce((n, s) => n + s.mock.calls.length, 0) };
}
const snapshot = (t: ReturnType<typeof setup>["t"]) => JSON.stringify([t.startups.rows, t.history.rows, t.features.rows, t.audit.rows]);
const richWorld = () => setup({
  startups: [RICH.startup, startupRow("sparse", { name: "Sparse Co" })], team: RICH.team, rounds: RICH.rounds,
  submissions: [{ publishedEntityId: "rich", kind: EntityKind.STARTUP, status: SubmissionStatus.APPROVED, payload: RICH.payload }],
});

describe("existing-startup backfill", () => {
  it("is a DRY RUN unless dryRun is explicitly false, and a dry run writes nothing (not even in memory copies of the real rows)", async () => {
    const w = richWorld();
    const before = snapshot(w.t);
    for (const opts of [undefined, {}, { dryRun: true }, { dryRun: undefined }]) {
      const r = await w.svc.run(opts as any);
      expect(r.mode).toBe("DRY_RUN");
    }
    expect(snapshot(w.t)).toBe(before);
    expect(w.calls()).toBe(0); // no save/update/create on any real table
    expect(w.experimental.onFeaturesChanged).not.toHaveBeenCalled();
  });

  it("scores a startup the platform already holds enough about (six factors, /10), straight from existing records", async () => {
    const w = richWorld();
    const r = await w.svc.run({ dryRun: true });
    const rich = r.startups.find((s) => s.slug === "startup-rich")!;
    expect(rich.scoreStatus).toBe("CALCULATED");
    expect(rich.ruwadScore).toBeGreaterThan(0);
    expect(rich.ruwadScore).toBeLessThanOrEqual(10);
    expect(Object.values(rich.factors).every((f) => f.score != null)).toBe(true);
    expect(rich.confidence).toBeGreaterThanOrEqual(MIN_OVERALL_CONFIDENCE);
    expect(rich.change).toBe("NEW_SCORE");
    expect(rich.mapped).toEqual(expect.arrayContaining(["teamSize <- directory headcount", "founder / pitch-deck values <- approved submission"]));
    const mean = Object.values(rich.factors).reduce((a, f) => a + (f.score as number), 0) / 6;
    expect(rich.ruwadScore).toBeCloseTo(mean, 6); // exactly the six-factor mean: nothing else enters it
    expect(r.totals).toMatchObject({ startups: 2, canReceiveScoreNow: 1, remainPending: 1 });
    expect(r.readyToScore).toEqual(["Startup rich"]);
  });

  it("a startup without enough data stays Pending with its real missing inputs: no number, no invented values", async () => {
    const w = richWorld();
    const r = await w.svc.run({ dryRun: true });
    const sparse = r.startups.find((s) => s.slug === "startup-sparse")!;
    expect(sparse).toMatchObject({ scoreStatus: "PENDING", ruwadScore: null, confidence: null, change: "NEW_PENDING_STATUS", mapped: [] });
    expect(sparse.missingFactors.length).toBeGreaterThan(0);
    expect(sparse.factors.growth.missingInputs).toEqual(expect.arrayContaining(["annualRevenue", "customerCount"]));
    expect(r.needingAdditionalData).toEqual([{ name: "Sparse Co", missingFactors: sparse.missingFactors }]);
    expect(r.mostCommonMissingFields[0].startups).toBeGreaterThan(0);
  });

  it("uses the existing thresholds and weights, and says so", async () => {
    const r = await richWorld().svc.run();
    expect(r.rule).toEqual({ minFactors: MIN_FACTOR_COVERAGE, minMeanFactorConfidence: MIN_OVERALL_CONFIDENCE, ruleWeight: RULE_WEIGHT, mlWeight: ML_WEIGHT });
    expect([MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, RULE_WEIGHT, ML_WEIGHT]).toEqual([4, 0.5, 1, 0]);
  });

  it("APPLY writes through the normal service: a BACKFILL history row per startup and the startup's score columns", async () => {
    const w = richWorld();
    const r = await w.svc.run({ dryRun: false });
    expect(r.mode).toBe("APPLIED");
    expect(r.written).toEqual({ historyRows: 2, startupsWithNewStatus: 2 });
    expect(w.t.history.rows.map((h) => h.triggeredBy)).toEqual([ScoreTrigger.BACKFILL, ScoreTrigger.BACKFILL]);
    const rich = w.t.startups.rows.find((s) => s.id === "rich")!;
    expect(rich.scoreStatus).toBe(ScoreStatus.CALCULATED);
    expect(rich.ruwadScore).toBeGreaterThan(0);
    expect(w.t.startups.rows.find((s) => s.id === "sparse")!).toMatchObject({ scoreStatus: ScoreStatus.INSUFFICIENT_DATA, ruwadScore: undefined });
  });

  it("a dry run predicts exactly what the apply run then produces", async () => {
    const dry = await richWorld().svc.run({ dryRun: true });
    const applied = await richWorld().svc.run({ dryRun: false });
    const pick = (r: typeof dry) => r.startups.map((s) => ({ slug: s.slug, status: s.scoreStatus, score: s.ruwadScore, confidence: s.confidence, factors: s.factors, mapped: s.mapped }));
    expect(pick(applied)).toEqual(pick(dry));
  });

  it("is idempotent: running it again changes nothing and adds no history row", async () => {
    const w = richWorld();
    await w.svc.run({ dryRun: false });
    const historyAfterFirst = w.t.history.rows.length;
    const featuresAfterFirst = JSON.stringify(w.t.features.rows);
    const second = await w.svc.run({ dryRun: false });
    expect(second.written).toEqual({ historyRows: 0, startupsWithNewStatus: 0 });
    expect(second.startups.every((s) => s.change === "UNCHANGED")).toBe(true);
    expect(w.t.history.rows).toHaveLength(historyAfterFirst);
    expect(JSON.stringify(w.t.features.rows)).toBe(featuresAfterFirst); // mapped values are not rewritten either
  });

  it("never involves the experimental ML model", async () => {
    const w = richWorld();
    await w.svc.run({ dryRun: false });
    await w.svc.run({ dryRun: true });
    expect(w.experimental.onFeaturesChanged).not.toHaveBeenCalled();
  });

  it("only covers the requested startups when a subset is given", async () => {
    const w = richWorld();
    const r = await w.svc.run({ dryRun: false, startupIds: ["sparse"] });
    expect(r.startups.map((s) => s.slug)).toEqual(["startup-sparse"]);
    expect(w.t.startups.rows.find((s) => s.id === "rich")!.scoreStatus).toBe(ScoreStatus.NOT_CALCULATED); // untouched
  });

  it("one startup failing does not stop the others or leave a half-written score", async () => {
    const w = setup({ startups: [startupRow("a", { name: "A" }), startupRow("bad", { name: "Bad" }), startupRow("c", { name: "C" })] });
    const realFind = w.t.team.find;
    w.t.team.find = (async (o: any) => { if (o?.where?.entityId === "bad") throw new Error("boom"); return realFind(o); }) as any;
    const r = await w.svc.run({ dryRun: false });
    expect(r.startups.map((s) => s.name)).toEqual(["A", "C"]);
    expect(w.t.history.rows.map((h) => h.startupId).sort()).toEqual(["a", "c"]);
  });
});

describe("what the backfill maps from existing records", () => {
  it("directory headcount becomes teamSize (positive figures only) with the existing-record provenance", async () => {
    const w = setup({ startups: [startupRow("hc", { employees: 12 }), startupRow("zero", { employees: 0 })] });
    await w.svc.run({ dryRun: false });
    const f = (id: string) => w.t.features.rows.find((x) => x.startupId === id);
    expect(f("hc")!.features.teamSize).toBe(12);
    expect(f("hc")!.provenance.teamSize.source).toBe(ScoreDataSource.EXTERNAL_SOURCE);
    expect(f("zero")?.features?.teamSize).toBeUndefined(); // 0 is how "unknown" looks: never a team of zero
  });

  it("never overrides a stronger source: a founder-submitted teamSize stays", async () => {
    const w = setup({
      startups: [startupRow("s", { employees: 12 })],
      features: [{ id: "f1", startupId: "s", features: { teamSize: 30 }, provenance: { teamSize: { source: ScoreDataSource.FOUNDER_SUBMITTED, verified: false, extractedAt: "2026-01-01T00:00:00Z" } } }],
    });
    await w.svc.run({ dryRun: false });
    const f = w.t.features.rows.find((x) => x.startupId === "s")!;
    expect(f.features.teamSize).toBe(30);
    expect(f.provenance.teamSize.source).toBe(ScoreDataSource.FOUNDER_SUBMITTED);
  });

  it("verified evidence is mapped, and the directory headcount wins over an older evidence teamSize", async () => {
    const ev = (fieldKey: string, valueNumeric: number, over: Record<string, any> = {}) => ({ startupId: "e", fieldKey, valueNumeric, effectiveDate: "2025-06-01", sourceType: HistoricalEvidenceSourceType.PUBLIC_NEWS_SOURCE, verified: true, status: EvidenceStatus.NO_CONFLICT, ...over });
    const w = setup({ startups: [startupRow("e", { employees: 40 })], evidence: [ev("founderCount", 3), ev("teamSize", 8), ev("fundingRounds", 2), ev("customerCount", 500, { verified: false })] });
    const r = await w.svc.run({ dryRun: false });
    const f = w.t.features.rows.find((x) => x.startupId === "e")!.features;
    expect(f).toMatchObject({ founderCount: 3, teamSize: 40, fundingRounds: 2 });
    expect(f.customerCount).toBeUndefined(); // unverified evidence is never used
    expect(r.startups[0].mapped).toEqual(expect.arrayContaining(["founderCount <- verified evidence", "teamSize <- directory headcount", "fundingRounds <- verified evidence"]));
  });
});

describe("selectEvidenceFeatures", () => {
  const e = (over: Record<string, any>) => ({ fieldKey: "teamSize", valueNumeric: 10, effectiveDate: "2025-01-01", sourceType: HistoricalEvidenceSourceType.PUBLIC_COMPANY_SOURCE, verified: true, status: EvidenceStatus.NO_CONFLICT, ...over }) as any;
  const today = "2026-10-05";

  it("keeps only verified, non-licensed, non-rejected/superseded/conflicting, past-dated numeric evidence for schema keys", () => {
    expect(selectEvidenceFeatures([e({}), e({ fieldKey: "founderCount", valueNumeric: 2 })], today)).toEqual({ teamSize: 10, founderCount: 2 });
    for (const bad of [{ verified: false }, { sourceType: HistoricalEvidenceSourceType.LICENSED_DATABASE }, { status: EvidenceStatus.REJECTED }, { status: EvidenceStatus.SUPERSEDED }, { status: EvidenceStatus.CONFLICT }, { effectiveDate: "2027-01-01" }, { valueNumeric: undefined }, { valueNumeric: -3 }, { fieldKey: "notAFeature" }]) {
      expect(selectEvidenceFeatures([e(bad)], today)).toEqual({});
    }
  });
  it("takes the latest effective date per key", () => {
    expect(selectEvidenceFeatures([e({ effectiveDate: "2024-01-01", valueNumeric: 5 }), e({ effectiveDate: "2026-02-01", valueNumeric: 9 }), e({ effectiveDate: "2025-05-01", valueNumeric: 7 })], today)).toEqual({ teamSize: 9 });
  });
});

describe("the backfill endpoint", () => {
  const roles = Reflect.getMetadata(ROLES_KEY, ScoringAdminController) as UserRole[];
  it("is admin-only", () => {
    expect([...roles].sort()).toEqual([UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN].sort());
    expect((Reflect.getMetadata("__guards__", ScoringAdminController) as { name: string }[]).map((g) => g.name)).toEqual(["JwtAuthGuard", "RolesGuard"]);
    expect(Reflect.getMetadata("path", ScoringAdminController.prototype.backfillExisting)).toBe("backfill-existing");
  });
  it("defaults to a dry run and only writes on an explicit dryRun:false", async () => {
    const run = jest.fn(async () => ({}));
    const c = new ScoringAdminController({} as any, { run } as any);
    await c.backfillExisting({} as any);
    await c.backfillExisting({ dryRun: true } as any);
    await c.backfillExisting({ dryRun: false, startupIds: ["x"] } as any);
    expect(run.mock.calls.map((a: any[]) => a[0].dryRun)).toEqual([true, true, false]);
  });
  it("validates its body: a non-boolean dryRun or non-uuid ids are rejected", async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const run = (b: unknown) => pipe.transform(b, { type: "body", metatype: BackfillExistingStartupsDto });
    await expect(run({})).resolves.toBeDefined();
    await expect(run({ dryRun: false, startupIds: ["6c166bf8-f584-42d9-b5fd-f6e7570d00eb"] })).resolves.toBeDefined();
    await expect(run({ dryRun: "no" })).rejects.toBeDefined();
    await expect(run({ startupIds: ["not-a-uuid"] })).rejects.toBeDefined();
    await expect(run({ dryRun: false, extra: 1 })).rejects.toBeDefined();
  });
  it("InMemoryTable understands TypeORM's In() so dry-run copies are filtered like the real query", async () => {
    const t = new InMemoryTable([{ id: "1", k: "a" }, { id: "2", k: "b" }, { id: "3", k: "c" }]);
    expect((await t.find({ where: { k: In(["a", "c"]) } })).map((r) => r.id)).toEqual(["1", "3"]);
    expect(await t.count({ where: { k: In(["b"]) } })).toBe(1);
  });
});
