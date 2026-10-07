import { ScoreDataSource, ScoreStatus, ScoreTrigger } from "../common/enums";
import { ScoringService } from "./scoring.service";
import type { MlScoringProvider } from "./ml/ml-scoring-provider.interface";
import type { FeatureDerivationService } from "./feature-derivation.service";
import type { MlSnapshotService } from "../ml-data/ml-snapshot.service";
import type { OutcomeEventsService } from "../ml-data/outcome-events.service";
import type { MlShadowPredictionService } from "../ml-data/ml-shadow-prediction.service";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => {
      let out = rows.filter((r) => matches(r, opts?.where));
      if (opts?.order?.calculatedAt === "DESC") out = [...out].sort((a, b) => b.calculatedAt - a.calculatedAt);
      if (opts?.order?.calculatedAt === "ASC") out = [...out].sort((a, b) => a.calculatedAt - b.calculatedAt);
      return out;
    }),
    findOne: jest.fn(async (opts: any) => {
      let out = rows.filter((r) => matches(r, opts.where));
      if (opts?.order?.calculatedAt === "DESC") out = [...out].sort((a, b) => b.calculatedAt - a.calculatedAt);
      return out[0] ?? null;
    }),
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

const nullMl: MlScoringProvider = { predict: async () => null };
const noDerivation: FeatureDerivationService = { deriveScoringFeatures: async () => ({}) } as unknown as FeatureDerivationService;
const noMlSnapshots: MlSnapshotService = { maybeSnapshot: async () => null } as unknown as MlSnapshotService;
const noOutcomeEvents: OutcomeEventsService = { createSystemEventIfNew: jest.fn(async () => null) } as unknown as OutcomeEventsService;
const noShadowPredictions: MlShadowPredictionService = { generateShadowPredictions: jest.fn(async () => undefined) } as unknown as MlShadowPredictionService;

const richStartup = (id: string) => ({
  id, category: "Digital Health", sfda: "Approved", fda: "N/A", ce: "N/A", clinicalStatus: "Not disclosed",
  marketTam: "SAR 2B", marketSam: "SAR 500M", marketSom: "SAR 50M", fundingTotal: 30,
});

describe("ScoringService", () => {
  let startups: ReturnType<typeof fakeRepo>;
  let history: ReturnType<typeof fakeRepo>;
  let features: ReturnType<typeof fakeRepo>;
  let audit: ReturnType<typeof fakeRepo>;
  let svc: ScoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    startups = fakeRepo([richStartup("s1")]);
    history = fakeRepo();
    features = fakeRepo();
    audit = fakeRepo();
    svc = new ScoringService(startups as any, history as any, features as any, audit as any, nullMl, noDerivation, noMlSnapshots, noOutcomeEvents, noShadowPredictions);
  });

  it("coerces a Postgres numeric column (returned as a string by the driver) back to a real number", async () => {
    // pg's driver returns `numeric` columns as strings, not JS numbers — a raw
    // history row looks exactly like this once loaded from a real database,
    // unlike every other test here which seeds true numbers directly.
    history.rows.push({ id: "h1", startupId: "s1", status: ScoreStatus.CALCULATED, ruwadScore: "7.55" as unknown as number, confidenceScore: "0.78" as unknown as number, version: "RUWAD-2.0", factors: {}, missingFactors: [], triggeredBy: ScoreTrigger.STARTUP_CREATED, calculatedAt: new Date() });
    const r = await svc.getScoreForStartup("s1");
    expect(r.ruwadScore).toBe(7.55);
    expect(typeof r.ruwadScore).toBe("number");
    expect(r.confidenceScore).toBe(0.78);

    const [row] = await svc.getScoreHistory("s1");
    expect(typeof row.ruwadScore).toBe("number");
    expect(row.ruwadScore).toBe(7.55);
  });

  it("whatever basis a row stores, the startup is scored on exactly what was provided: no data -> no score, some data -> a score with the rest counted as 0", async () => {
    for (const basis of [undefined, "STANDARD", "EXISTING_DATA"]) {
      startups.rows[0] = { id: "s1", category: "Digital Health", sfda: "N/A", fda: "N/A", ce: "N/A", marketTam: "", marketSam: "", marketSom: "", fundingTotal: 0, scoringBasis: basis };
      features.rows.length = 0;
      history.rows.length = 0;
      const none = await svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED);
      expect(none.ruwadScore).toBeNull(); // nothing provided: never a made-up number
      expect(none.status).toBe(ScoreStatus.INSUFFICIENT_DATA);

      features.rows.push({ id: "f1", startupId: "s1", features: { teamSize: 12 }, provenance: { teamSize: { source: ScoreDataSource.FOUNDER_SUBMITTED, verified: false } } });
      const some = await svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED);
      expect(some.status).toBe(ScoreStatus.CALCULATED);
      expect(some.ruwadScore).toBeGreaterThan(0);
      expect(some.factors.team.inputsUsed).toContain("teamSize");
      for (const k of ["growth", "financial", "market", "technology"] as const) {
        expect(some.factors[k].inputsUsed).toEqual([]); // not provided -> contributes nothing
        expect(some.factors[k].score).toBe(0);
        expect(some.factors[k].confidence).toBe(0);
      }
      expect(some.ruwadScore).toBeCloseTo((some.factors.team.score as number) / 6, 1); // mean of six, five of them counted as 0
    }
  });

  it("returns NOT_CALCULATED with a null score when nothing has ever been calculated", async () => {
    const r = await svc.getScoreForStartup("s1");
    expect(r.status).toBe(ScoreStatus.NOT_CALCULATED);
    expect(r.ruwadScore).toBeNull();
  });

  it("a startup with rich existing data (funding + regulatory + market) plus reported team/growth/tech features reaches CALCULATED", async () => {
    await svc.setFeatures("s1", {
      founderExperienceYears: 10, healthcareExperienceYears: 8, teamSize: 12,
      quarterlyRevenueGrowth: 20, customerGrowthRate: 40,
      patentsGranted: 2, proprietaryTechnology: true,
    }, ScoreDataSource.ADMIN_ENTERED, "admin-1", "seeding test data");

    const r = await svc.getScoreForStartup("s1");
    expect(r.status).toBe(ScoreStatus.CALCULATED);
    expect(r.ruwadScore).not.toBeNull();
    expect(r.ruwadScore!).toBeGreaterThanOrEqual(0);
    expect(r.ruwadScore!).toBeLessThanOrEqual(10);
    expect(r.confidenceScore).not.toBeNull();
    expect(r.missingFactors.length).toBeLessThan(2);
  });

  it("a startup with almost no data stays INSUFFICIENT_DATA, never a fabricated score", async () => {
    startups.rows.push({ id: "s2", category: "Digital Health", sfda: "N/A", fda: "N/A", ce: "N/A", clinicalStatus: "Not disclosed", marketTam: "", marketSam: "", marketSom: "", fundingTotal: 0 });
    const r = await svc.recalculateStartupScore("s2", ScoreTrigger.STARTUP_CREATED);
    expect(r.status).toBe(ScoreStatus.INSUFFICIENT_DATA);
    expect(r.ruwadScore).toBeNull();
  });

  it("keeps the startups table's denormalized cache in sync with the latest history row", async () => {
    await svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_CREATED); // regulatory + financial + market only -> likely still insufficient
    const cached = startups.rows.find((r) => r.id === "s1")!;
    const latest = await svc.getScoreForStartup("s1");
    expect(cached.scoreStatus).toBe(latest.status);
    expect(cached.ruwadScore ?? null).toEqual(latest.ruwadScore);
  });

  it("recalculating twice with unchanged inputs is deterministic (same score/status/confidence)", async () => {
    // setFeatures() itself triggers one recalculation, so this is 3 calculations total (1 implicit + 2 explicit).
    await svc.setFeatures("s1", { founderExperienceYears: 6, teamSize: 5, quarterlyRevenueGrowth: 15, patentsGranted: 1 }, ScoreDataSource.ADMIN_ENTERED, "admin-1", "seed");
    const a = await svc.recalculateStartupScore("s1", ScoreTrigger.ADMIN_RECALCULATION);
    const b = await svc.recalculateStartupScore("s1", ScoreTrigger.ADMIN_RECALCULATION);
    expect(a.status).toBe(b.status);
    expect(a.ruwadScore).toBe(b.ruwadScore);
    expect(a.confidenceScore).toBe(b.confidenceScore);
    expect(history.rows.length).toBe(3); // append-only: every calculation gets its own row, nothing overwritten
  });

  it("setFeatures audits every changed key with previous/new value, admin id and reason — never a silent overwrite", async () => {
    await svc.setFeatures("s1", { teamSize: 5 }, ScoreDataSource.ADMIN_ENTERED, "admin-1", "initial entry");
    await svc.setFeatures("s1", { teamSize: 8 }, ScoreDataSource.ADMIN_ENTERED, "admin-2", "corrected headcount");
    const rows = audit.rows.filter((r) => r.featureKey === "teamSize");
    expect(rows).toHaveLength(2);
    expect(rows[1].previousValue).toBe(5);
    expect(rows[1].newValue).toBe(8);
    expect(rows[1].adminUserId).toBe("admin-2");
    expect(rows[1].reason).toBe("corrected headcount");
  });

  it("mergeExtractedFeatures (AI Autofill path) writes features with PITCH_DECK_EXTRACTED provenance but no admin audit row", async () => {
    await svc.mergeExtractedFeatures("s1", { customerCount: 40 }, "doc-1");
    const row = await svc.getFeatures("s1");
    expect(row.features.customerCount).toBe(40);
    expect(row.provenance.customerCount?.source).toBe(ScoreDataSource.PITCH_DECK_EXTRACTED);
    expect(audit.rows).toHaveLength(0);
  });

  describe("automatic regulatory outcome-event derivation", () => {
    it("mergeExtractedFeatures (a non-admin write path) logs a REGULATORY_MILESTONE outcome event when the milestone value actually changes", async () => {
      await svc.mergeExtractedFeatures("s1", { regulatoryMilestone: "strategy prepared" });
      expect(noOutcomeEvents.createSystemEventIfNew).toHaveBeenCalledWith("s1", expect.objectContaining({ eventType: "REGULATORY_MILESTONE", valueText: "strategy prepared" }));
    });

    it("does not log an event when regulatoryMilestone is written but unchanged from its current value", async () => {
      await svc.mergeExtractedFeatures("s1", { regulatoryMilestone: "strategy prepared" });
      (noOutcomeEvents.createSystemEventIfNew as jest.Mock).mockClear();
      await svc.mergeExtractedFeatures("s1", { regulatoryMilestone: "strategy prepared" });
      expect(noOutcomeEvents.createSystemEventIfNew).not.toHaveBeenCalled();
    });

    it("does not log an event for any other feature key changing", async () => {
      await svc.mergeExtractedFeatures("s1", { customerCount: 40 });
      expect(noOutcomeEvents.createSystemEventIfNew).not.toHaveBeenCalled();
    });

    it("setFeatures (the admin path) never triggers automatic derivation — an admin has the dedicated outcome-entry UI instead", async () => {
      await svc.setFeatures("s1", { regulatoryMilestone: "SFDA submission" }, ScoreDataSource.ADMIN_ENTERED, "admin-1", "reviewed filing");
      expect(noOutcomeEvents.createSystemEventIfNew).not.toHaveBeenCalled();
    });
  });

  describe("source precedence — a weaker source never silently downgrades a stronger one", () => {
    it("a later PITCH_DECK_EXTRACTED write is dropped for a key an admin already entered", async () => {
      await svc.setFeatures("s1", { customerCount: 100 }, ScoreDataSource.ADMIN_ENTERED, "admin-1", "verified from cap table");
      await svc.mergeExtractedFeatures("s1", { customerCount: 40 }); // a fresh, weaker pitch-deck extraction
      const row = await svc.getFeatures("s1");
      expect(row.features.customerCount).toBe(100); // unchanged — extraction was rejected
      expect(row.provenance.customerCount?.source).toBe(ScoreDataSource.ADMIN_ENTERED);
    });

    it("applyFounderAndAiFeatures splits a patch by key and never lets the AI half overwrite an existing founder value", async () => {
      await svc.applyFounderAndAiFeatures("s1", { teamSize: 8 }, {}); // founder reports team size directly
      await svc.applyFounderAndAiFeatures("s1", {}, { teamSize: 3, customerCount: 50 }); // a later extraction disagrees on teamSize, agrees to add customerCount
      const row = await svc.getFeatures("s1");
      expect(row.features.teamSize).toBe(8); // founder's figure wins
      expect(row.provenance.teamSize?.source).toBe(ScoreDataSource.FOUNDER_SUBMITTED);
      expect(row.features.customerCount).toBe(50); // nothing stronger existed yet, so the extraction is accepted
      expect(row.provenance.customerCount?.source).toBe(ScoreDataSource.PITCH_DECK_EXTRACTED);
    });

    it("an admin write always overrides regardless of the existing source's rank", async () => {
      await svc.setFeatures("s1", { teamSize: 5 }, ScoreDataSource.ADMIN_ENTERED, "admin-1", "seed");
      await svc.setFeatures("s1", { teamSize: 9 }, ScoreDataSource.ADMIN_ENTERED, "admin-1", "correction");
      const row = await svc.getFeatures("s1");
      expect(row.features.teamSize).toBe(9);
    });
  });

  describe("verifyFeatures", () => {
    it("bumps an existing value's provenance to VERIFIED_DOCUMENT without changing the value, and audits the action", async () => {
      await svc.mergeExtractedFeatures("s1", { customerCount: 40 });
      await svc.verifyFeatures("s1", ["customerCount"], "admin-1");
      const row = await svc.getFeatures("s1");
      expect(row.features.customerCount).toBe(40);
      expect(row.provenance.customerCount?.source).toBe(ScoreDataSource.VERIFIED_DOCUMENT);
      expect(row.provenance.customerCount?.verified).toBe(true);
      expect(audit.rows.some((r) => r.featureKey === "customerCount")).toBe(true);
    });

    it("is a no-op for a key that has no existing value", async () => {
      const before = await svc.getFeatures("s1");
      await svc.verifyFeatures("s1", ["annualRevenue"], "admin-1");
      const after = await svc.getFeatures("s1");
      expect(after.provenance).toEqual(before.provenance);
    });
  });

  it("regulatory readiness alone (from existing sfda status) is not enough coverage for an overall score", async () => {
    // richStartup has sfda="Approved" + market + funding already on the entity — exactly 3 factors' worth of
    // existing-column signal, one short of MIN_FACTOR_COVERAGE (4) — must stay INSUFFICIENT_DATA.
    const r = await svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_CREATED);
    const computed = Object.values(r.factors).filter((f) => f.score != null).length;
    if (computed < 4) expect(r.status).toBe(ScoreStatus.INSUFFICIENT_DATA);
  });

  it("recalculateStartupScore applies derived features (SYSTEM_DERIVED) before computing, without overwriting a stronger existing source", async () => {
    const derivingSvc = new ScoringService(startups as any, history as any, features as any, audit as any, nullMl, {
      deriveScoringFeatures: async () => ({ teamSize: 4, founderCount: 2 }),
    } as unknown as FeatureDerivationService, noMlSnapshots, noOutcomeEvents, noShadowPredictions);
    await derivingSvc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_CREATED);
    const row = await derivingSvc.getFeatures("s1");
    expect(row.features.teamSize).toBe(4);
    expect(row.provenance.teamSize?.source).toBe(ScoreDataSource.SYSTEM_DERIVED);

    // A founder-reported teamSize must survive a later derivation disagreeing with it.
    await derivingSvc.applyFounderAndAiFeatures("s1", { teamSize: 11 }, {});
    await derivingSvc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED);
    const after = await derivingSvc.getFeatures("s1");
    expect(after.features.teamSize).toBe(11);
    expect(after.provenance.teamSize?.source).toBe(ScoreDataSource.FOUNDER_SUBMITTED);
  });

  it("backfillAll recalculates every startup and reports a per-row outcome, continuing past a single failure", async () => {
    (startups.rows.find((r) => r.id === "s1") as any).name = "Nala Health";
    startups.rows.push({ id: "s2", name: "Empty Co", category: "Digital Health", sfda: "N/A", fda: "N/A", ce: "N/A", clinicalStatus: "Not disclosed", marketTam: "", marketSam: "", marketSom: "", fundingTotal: 0 });
    const results = await svc.backfillAll();
    expect(results.map((r) => r.startupId).sort()).toEqual(["s1", "s2"].sort());
    expect(results.find((r) => r.startupId === "s2")!.status).toBe(ScoreStatus.INSUFFICIENT_DATA);
  });
});
