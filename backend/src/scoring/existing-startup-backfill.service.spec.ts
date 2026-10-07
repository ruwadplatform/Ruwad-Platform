import { In } from "typeorm";
import { ValidationPipe } from "@nestjs/common";
import { EntityKind, EvidenceStatus, HistoricalEvidenceSourceType, ScoreDataSource, ScoreStatus, ScoreTrigger, ScoringBasis, SubmissionStatus, UserRole } from "../common/enums";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, ML_WEIGHT, RULE_WEIGHT, SCORE_VERSION, SCORE_VERSION_EXISTING_DATA } from "./scoring.constants";
import { EXISTING_DATA_NOTE, StartupAssessmentService } from "./startup-assessment.service";
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

describe("existing directory startups: scored on what is on file, a factor with no data counts as 0", () => {
  /** Directory startup (no founder submission) with a little real data: headcount, funding, market size and an SFDA approval. Nothing on growth, technology. */
  const PARTIAL = startupRow("partial", { name: "Partial Co", employees: 20, fundingTotal: 3, marketTam: "SAR 2B", marketSam: "SAR 500M", marketSom: "SAR 50M", sfda: "Approved" });
  const partialWorld = () => setup({ startups: [PARTIAL, startupRow("nothing", { name: "Nothing Known Co" })] });

  it("gives the startup a score from the data it has, with each factor lacking data counted as 0 (growth, technology)", async () => {
    const r = await partialWorld().svc.run({ dryRun: true });
    const p = r.startups.find((x) => x.slug === "startup-partial")!;
    expect(p.basis).toBe(ScoringBasis.EXISTING_DATA);
    expect(p.scoreStatus).toBe("CALCULATED");
    // factors with real inputs keep the engine's own score; the others are exactly 0
    expect(p.factors.growth.score).toBe(0);
    expect(p.factors.technology.score).toBe(0);
    for (const k of ["financial", "market", "team", "regulatory"] as const) expect(p.factors[k].score).toBeGreaterThan(0);
    expect(p.missingFactors.sort()).toEqual(["growth", "technology"]);
    // overall = mean of all six (zeros included); confidence honestly low because missing factors carry 0 confidence
    const six = Object.values(p.factors);
    expect(p.ruwadScore).toBeCloseTo(six.reduce((a, f) => a + (f.score as number), 0) / 6, 6);
    expect(p.confidence).toBeCloseTo(six.reduce((a, f) => a + f.confidence, 0) / 6, 6);
    expect(p.confidence).toBeLessThan(MIN_OVERALL_CONFIDENCE);
    expect(p.change).toBe("NEW_SCORE");
  });

  it("a startup with NO real data in any factor stays Pending: never a 0 / 10 for 'nothing known' (the default SFDA 'Not Submitted' is not data)", async () => {
    const r = await partialWorld().svc.run({ dryRun: true });
    const n = r.startups.find((x) => x.slug === "startup-nothing")!;
    expect(n).toMatchObject({ basis: ScoringBasis.EXISTING_DATA, scoreStatus: "PENDING", ruwadScore: null, confidence: null });
    expect(r.readyToScore).toEqual(["Partial Co"]);
  });

  it("the score is stored with its own version tag, so it can never be mistaken for a standard score, and the basis persists", async () => {
    const w = partialWorld();
    await w.svc.run({ dryRun: false });
    expect(w.t.startups.rows.find((s) => s.id === "partial")).toMatchObject({ scoringBasis: ScoringBasis.EXISTING_DATA, scoreStatus: ScoreStatus.CALCULATED, scoreVersion: SCORE_VERSION_EXISTING_DATA });
    expect(w.t.history.rows.find((h) => h.startupId === "partial")).toMatchObject({ version: SCORE_VERSION_EXISTING_DATA, triggeredBy: ScoreTrigger.BACKFILL });
    // a later recalculation (e.g. the owner edits something) keeps the same basis rather than flipping the startup back to Pending
    const again = await w.scoring.recalculateStartupScore("partial", ScoreTrigger.STARTUP_UPDATED);
    expect(again.status).toBe(ScoreStatus.CALCULATED);
    expect(again.version).toBe(SCORE_VERSION_EXISTING_DATA);
  });

  it("is idempotent on this basis too", async () => {
    const w = partialWorld();
    await w.svc.run({ dryRun: false });
    const rows = w.t.history.rows.length;
    const second = await w.svc.run({ dryRun: false });
    expect(second.written).toEqual({ historyRows: 0, startupsWithNewStatus: 0 });
    expect(w.t.history.rows).toHaveLength(rows);
  });

  it("a founder-submitted startup is never held to the old 4-factor rule: it is scored on what it provided, and the old thresholds are still defined", async () => {
    const w = setup({
      startups: [startupRow("founder", { name: "Founder Co", employees: 12, fundingTotal: 1 })],
      submissions: [{ publishedEntityId: "founder", kind: EntityKind.STARTUP, status: SubmissionStatus.APPROVED, payload: { name: "Founder Co", employees: 12 } }],
    });
    const r = await w.svc.run({ dryRun: false });
    const f = r.startups[0];
    expect(f.scoreStatus).toBe("CALCULATED"); // thin data still scores: the headcount and funding the founder gave
    expect(f.ruwadScore).toBeGreaterThan(0);
    expect([MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, SCORE_VERSION]).toEqual([4, 0.5, "RUWAD-2.0"]);
  });

  it("the founder-facing assessment labels it honestly and keeps the zeroed factors visible with what would raise them", async () => {
    const w = partialWorld();
    await w.svc.run({ dryRun: false });
    const view = await new StartupAssessmentService(w.scoring, { ownerView: async () => ({ models: [] }) } as any).get("partial");
    expect(view.ruwadScore).toMatchObject({ state: "READY", basis: "EXISTING_DATA", basisNote: EXISTING_DATA_NOTE });
    expect(view.ruwadScore.value).toBeGreaterThan(0);
    const growth = view.factors.find((f) => f.key === "growth")!;
    expect(growth.score).toBe(0);
    expect(growth.explanation).toMatch(/Counted as 0 \(existing-startup basis\)/);
    expect(growth.missingFields.length).toBeGreaterThan(0);
  });
});

describe("idempotency at the database's stored precision", () => {
  it("a stored score of 1.67 and a recomputed 1.6667 are the same result: re-running adds no history row", async () => {
    const w = setup({ startups: [startupRow("p", { name: "P", employees: 20, fundingTotal: 3, marketTam: "SAR 2B", marketSam: "SAR 500M", marketSom: "SAR 50M", sfda: "Approved" })] });
    await w.svc.run({ dryRun: false });
    // what Postgres numeric(4,2)/(3,2) actually hands back
    for (const h of w.t.history.rows) { h.ruwadScore = Math.round(h.ruwadScore * 100) / 100; h.confidenceScore = Math.round(h.confidenceScore * 100) / 100; }
    for (const st of w.t.startups.rows) { st.ruwadScore = Math.round(st.ruwadScore * 100) / 100; st.scoreConfidence = Math.round(st.scoreConfidence * 100) / 100; }
    expect(w.t.history.rows[0].ruwadScore).not.toBe(w.t.history.rows[0].ruwadScore * 1.0000001); // sanity: it is a rounded value
    const second = await w.svc.run({ dryRun: false });
    expect(second.written).toEqual({ historyRows: 0, startupsWithNewStatus: 0 });
    expect(second.startups[0].change).toBe("UNCHANGED");
    expect(w.t.history.rows).toHaveLength(1);
  });
  it("the same holds for any recalculation, not just the backfill (a no-op update adds no history row)", async () => {
    const w = setup({ startups: [startupRow("q", { name: "Q", employees: 20, fundingTotal: 3, marketTam: "SAR 2B", marketSam: "SAR 500M", marketSom: "SAR 50M", sfda: "Approved" })] });
    await w.svc.run({ dryRun: false });
    for (const h of w.t.history.rows) { h.ruwadScore = Math.round(h.ruwadScore * 100) / 100; h.confidenceScore = Math.round(h.confidenceScore * 100) / 100; }
    await w.scoring.recalculateStartupScore("q", ScoreTrigger.STARTUP_UPDATED);
    expect(w.t.history.rows).toHaveLength(1);
  });
});

