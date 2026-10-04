import { readFileSync } from "fs";
import { join } from "path";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EntityKind, MembershipRole, ScoreDataSource, ScoreStatus, ScoreTrigger, SubmissionEventType, SubmissionStatus, UserRole } from "../common/enums";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { OWNED_ENTITY_KIND_KEY } from "../common/decorators/owned-entity.decorator";
import { SubmissionsService } from "../submissions/submissions.service";
import { ScoringService } from "./scoring.service";
import { StartupAssessmentController } from "./startup-assessment.controller";
import { PENDING_MESSAGE, StartupAssessmentService } from "./startup-assessment.service";
import { ML_WEIGHT, RULE_WEIGHT } from "./scoring.constants";
import { affectsScoring } from "../startups/scoring-relevance";
import { StartupsService } from "../startups/startups.service";

// ---------------------------------------------------------------- shared fakes
function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  const match = (row: any, where: any) => !where || (Array.isArray(where) ? where : [where]).some((w: any) => Object.entries(w).every(([k, v]) => row[k] === v));
  const sorted = (list: any[], order: any) => (order?.calculatedAt === "DESC" ? [...list].sort((a, b) => +b.calculatedAt - +a.calculatedAt) : list);
  return {
    rows,
    find: jest.fn(async (opts?: any) => sorted(rows.filter((r) => match(r, opts?.where)), opts?.order)),
    findOne: jest.fn(async (opts: any) => sorted(rows.filter((r) => match(r, opts.where)), opts?.order)[0] ?? null),
    findOneOrFail: jest.fn(async (opts: any) => { const r = rows.find((x) => match(x, opts.where)); if (!r) throw new Error("not found"); return r; }),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
    update: jest.fn(async (id: string, patch: any) => { const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); }),
  };
}

const richStartup = (id: string) => ({ id, name: "Acme", category: "Digital Health", sfda: "Approved", fda: "N/A", ce: "N/A", clinicalStatus: "Not disclosed", marketTam: "SAR 2B", marketSam: "SAR 500M", marketSom: "SAR 50M", fundingTotal: 30, employees: 20 });
const RICH_FEATURES = { founderExperienceYears: 10, healthcareExperienceYears: 8, teamSize: 12, quarterlyRevenueGrowth: 20, customerGrowthRate: 40, patentsGranted: 2, proprietaryTechnology: true };

function scoring(opts: { snapshot?: unknown; experimental?: any; startupRow?: any; derived?: any } = {}) {
  const startups = fakeRepo([opts.startupRow ?? richStartup("s1")]);
  const history = fakeRepo();
  const features = fakeRepo();
  const audit = fakeRepo();
  const snapshots = { maybeSnapshot: jest.fn(async () => (opts.snapshot === undefined ? { id: "snap" } : opts.snapshot)) };
  const experimental = opts.experimental === undefined ? { onFeaturesChanged: jest.fn(async () => undefined) } : opts.experimental;
  const svc = new ScoringService(
    startups as any, history as any, features as any, audit as any, { predict: async () => null } as any,
    { deriveScoringFeatures: async () => opts.derived ?? {} } as any, snapshots as any,
    { createSystemEventIfNew: jest.fn(async () => null) } as any, { generateShadowPredictions: jest.fn(async () => undefined) } as any, experimental ?? undefined,
  );
  return { svc, startups, history, features, snapshots, experimental };
}

// ---------------------------------------------------------------- submissions
function submissions(kind: EntityKind, opts: { payload?: Record<string, unknown>; publishFails?: boolean; scoringFails?: boolean } = {}) {
  const item: any = { id: "sub-1", userId: "founder-1", kind, status: SubmissionStatus.DRAFT, payload: opts.payload ?? { name: "Acme" }, title: "Acme" };
  const memberships: any[] = [];
  const reviewEvents: any[] = [];
  const repo: any = { findOne: jest.fn(async () => item), save: jest.fn(async (x: any) => Object.assign(item, x)) };
  const events: any = { save: jest.fn(async (x: any) => { reviewEvents.push(x); return x; }), create: (x: any) => x };
  const manager: any = {
    getRepository: (entity: { name: string }) => ({
      create: (x: any) => x,
      save: async (x: any) => { if (entity.name === "EntityMembership") memberships.push(x); if (entity.name === "SubmissionReviewEvent") reviewEvents.push(x); if (entity.name === "Submission") Object.assign(item, x); return x; },
    }),
  };
  const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  const scoringSvc: any = {
    applyFounderAndAiFeatures: jest.fn(async () => undefined),
    recalculateStartupScore: jest.fn(async () => { if (opts.scoringFails) throw new Error("engine down"); return { status: ScoreStatus.CALCULATED }; }),
  };
  const publisher = (k: EntityKind) => ({ kind: k, publish: jest.fn(async () => { if (opts.publishFails) throw new Error("db"); return "startup-1"; }) });
  const svc = new SubmissionsService(
    repo, events, dataSource, { log: jest.fn(async () => undefined) } as any, {} as any,
    { findByIdOrThrow: jest.fn(async () => ({ firstName: "F", lastName: "O", email: "f@x.y" })) } as any, { sendStartupSubmissionReceived: jest.fn(async () => undefined) } as any,
    scoringSvc, { createSystemEventIfNew: jest.fn(async () => null) } as any,
    publisher(EntityKind.STARTUP) as any, publisher(EntityKind.INVESTOR) as any, publisher(EntityKind.HUB) as any, publisher(EntityKind.RESEARCH) as any, publisher(EntityKind.MULTINATIONAL) as any,
  );
  jest.spyOn(svc as any, "assertPayloadValid").mockResolvedValue(undefined);
  return { svc, item, memberships, reviewEvents, scoringSvc };
}

describe("founder submission -> automatic RUWAD assessment, with no admin step", () => {
  const submit = (t: ReturnType<typeof submissions>) => { t.item.status = SubmissionStatus.DRAFT; return t.svc.submit("founder-1", "sub-1"); };

  it("publishes a startup the moment it is submitted and runs deterministic scoring — no admin review", async () => {
    const t = submissions(EntityKind.STARTUP);
    const out = await submit(t);
    expect(out.status).toBe(SubmissionStatus.APPROVED);
    expect(out.publishedEntityId).toBe("startup-1");
    expect(t.scoringSvc.recalculateStartupScore).toHaveBeenCalledWith("startup-1", ScoreTrigger.SUBMISSION_PUBLISHED);
    expect(out.reviewedByUserId).toBeUndefined(); // no reviewer was involved
  });
  it("the submitter becomes OWNER, and the audit trail says it was automatic", async () => {
    const t = submissions(EntityKind.STARTUP);
    await submit(t);
    expect(t.memberships).toEqual([expect.objectContaining({ userId: "founder-1", kind: EntityKind.STARTUP, entityId: "startup-1", role: MembershipRole.OWNER })]);
    const approved = t.reviewEvents.find((e) => e.eventType === SubmissionEventType.APPROVED);
    expect(approved).toMatchObject({ actorUserId: "founder-1" });
    expect(approved.message).toMatch(/no admin review required/i);
  });
  it("founder values and AI-extracted pitch-deck values are applied BEFORE scoring, so extraction feeds the assessment", async () => {
    const t = submissions(EntityKind.STARTUP, { payload: { name: "Acme", annualRevenue: 1_000_000, customerCount: 40, aiFilledScoringKeys: ["customerCount"] } });
    await submit(t);
    const [founderPatch, aiPatch] = t.scoringSvc.applyFounderAndAiFeatures.mock.calls[0].slice(1, 3);
    expect(founderPatch).toMatchObject({ annualRevenue: 1_000_000 });
    expect(aiPatch).toMatchObject({ customerCount: 40 });
    expect(t.scoringSvc.applyFounderAndAiFeatures.mock.invocationCallOrder[0]).toBeLessThan(t.scoringSvc.recalculateStartupScore.mock.invocationCallOrder[0]);
  });
  it("an assessment failure never undoes the publish", async () => {
    const t = submissions(EntityKind.STARTUP, { scoringFails: true });
    const out = await submit(t);
    expect(out.status).toBe(SubmissionStatus.APPROVED);
  });
  it("if publishing itself fails the submission stays SUBMITTED for an admin, and the founder's submit still succeeds", async () => {
    const t = submissions(EntityKind.STARTUP, { publishFails: true });
    const out = await submit(t);
    expect(out.status).toBe(SubmissionStatus.SUBMITTED);
    expect(t.scoringSvc.recalculateStartupScore).not.toHaveBeenCalled();
  });
  it("only startups are auto-published: other listing kinds still wait for admin approval", async () => {
    for (const kind of [EntityKind.INVESTOR, EntityKind.HUB, EntityKind.RESEARCH, EntityKind.MULTINATIONAL]) {
      const t = submissions(kind);
      expect((await submit(t)).status).toBe(SubmissionStatus.SUBMITTED);
    }
  });
  it("the admin approve path still works and still records the admin as the reviewer", async () => {
    const t = submissions(EntityKind.STARTUP);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    t.item.userId = "founder-1";
    const out = await t.svc.approve("admin-1", "sub-1");
    expect(out.reviewedByUserId).toBe("admin-1");
    expect(t.reviewEvents.find((e) => e.eventType === SubmissionEventType.APPROVED)).toMatchObject({ actorUserId: "admin-1" });
  });
});

describe("the assessment pipeline in ScoringService", () => {
  it("runs the experimental ML step AFTER the official score is saved", async () => {
    const t = scoring();
    await t.svc.setFeatures("s1", RICH_FEATURES, ScoreDataSource.ADMIN_ENTERED, "admin", "seed");
    expect(t.history.rows.length).toBeGreaterThan(0);
    expect(t.experimental.onFeaturesChanged).toHaveBeenCalledWith("s1");
  });
  it("hands every reassessment to the ML step, which de-duplicates by input (an unchanged input never re-asks the model)", async () => {
    const t = scoring({ snapshot: null });
    await t.svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED);
    expect(t.experimental.onFeaturesChanged).toHaveBeenCalledWith("s1");
  });
  it("an ML failure (rejected promise) never prevents or alters the RUWAD Score", async () => {
    const failing = scoring({ experimental: { onFeaturesChanged: jest.fn(async () => { throw new Error("fastapi down"); }) } });
    const healthy = scoring({ experimental: null });
    for (const t of [failing, healthy]) await t.svc.setFeatures("s1", RICH_FEATURES, ScoreDataSource.ADMIN_ENTERED, "admin", "seed");
    const a = await failing.svc.getScoreForStartup("s1");
    const b = await healthy.svc.getScoreForStartup("s1");
    await new Promise((r) => setImmediate(r)); // let the fire-and-forget rejection settle: it must be swallowed
    expect(a.status).toBe(ScoreStatus.CALCULATED);
    expect({ s: a.ruwadScore, c: a.confidenceScore, f: a.factors }).toEqual({ s: b.ruwadScore, c: b.confidenceScore, f: b.factors });
  });
  it("a hung ML service cannot delay scoring: the hook is not awaited", async () => {
    const never = scoring({ experimental: { onFeaturesChanged: jest.fn(() => new Promise(() => undefined)) } });
    await expect(never.svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED)).resolves.toBeDefined();
  });
  it("experimental output is not part of the score: identical with ML on or off, and the weights are fixed at 1 / 0", async () => {
    expect(RULE_WEIGHT).toBe(1);
    expect(ML_WEIGHT).toBe(0);
    const on = scoring();
    const off = scoring({ experimental: null });
    await on.svc.setFeatures("s1", RICH_FEATURES, ScoreDataSource.ADMIN_ENTERED, "admin", "seed");
    await off.svc.setFeatures("s1", RICH_FEATURES, ScoreDataSource.ADMIN_ENTERED, "admin", "seed");
    expect((await on.svc.getScoreForStartup("s1")).ruwadScore).toBe((await off.svc.getScoreForStartup("s1")).ruwadScore);
  });
  it("insufficient deterministic data gives a null score with INSUFFICIENT_DATA — never 0", async () => {
    const t = scoring({ startupRow: { id: "s1", name: "Bare", category: "Digital Health", sfda: "N/A", fda: "N/A", ce: "N/A", marketTam: "", marketSam: "", marketSom: "", fundingTotal: 0 } });
    const r = await t.svc.recalculateStartupScore("s1", ScoreTrigger.SUBMISSION_PUBLISHED);
    expect(r.status).toBe(ScoreStatus.INSUFFICIENT_DATA);
    expect(r.ruwadScore).toBeNull();
  });
  it("pitch-deck extraction triggers a reassessment (PITCH_DECK_PROCESSED); an empty extraction does not", async () => {
    const t = scoring();
    await t.svc.mergeExtractedFeatures("s1", { customerCount: 100 });
    expect(t.history.rows.some((r) => r.triggeredBy === ScoreTrigger.PITCH_DECK_PROCESSED)).toBe(true);
    const before = t.history.rows.length;
    await t.svc.mergeExtractedFeatures("s1", {});
    expect(t.history.rows.length).toBe(before);
  });
});

describe("score history stays intact and is not flooded", () => {
  it("an unchanged recalculation adds no new row; a changed one does, and older rows are preserved", async () => {
    const t = scoring();
    await t.svc.setFeatures("s1", RICH_FEATURES, ScoreDataSource.ADMIN_ENTERED, "admin", "seed"); // admin trigger: recorded
    const afterSeed = t.history.rows.length;
    await t.svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED);
    await t.svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED);
    expect(t.history.rows.length).toBe(afterSeed); // identical results are not re-recorded
    const firstId = t.history.rows[0].id;
    await t.svc.setFeatures("s1", { customerGrowthRate: 90 }, ScoreDataSource.ADMIN_ENTERED, "admin", "changed");
    expect(t.history.rows.length).toBe(afterSeed + 1);
    expect(t.history.rows.some((r) => r.id === firstId)).toBe(true);
  });
  it("an explicit admin recalculation is always recorded", async () => {
    const t = scoring();
    await t.svc.recalculateStartupScore("s1", ScoreTrigger.STARTUP_UPDATED);
    const n = t.history.rows.length;
    await t.svc.recalculateStartupScore("s1", ScoreTrigger.ADMIN_RECALCULATION);
    expect(t.history.rows.length).toBe(n + 1);
  });
});

describe("only meaningful startup edits start a new assessment", () => {
  const before: any = { category: "Digital Health", fundingTotal: "30.00", employees: 20, sfda: "Approved", tagline: "old", website: "a.com", marketCompetitors: ["x"] };
  it("logo, links, tagline, website and wording are cosmetic", () => {
    expect(affectsScoring(before, { tagline: "new", website: "b.com", linkedin: "li", desc: "reworded" } as any)).toBe(false);
    expect(affectsScoring(before, { fundingTotal: 30, sfda: "Approved" } as any)).toBe(false); // unchanged values (numeric string vs number)
  });
  it("revenue-style, funding, regulatory, headcount, market, team and rounds changes are meaningful", () => {
    expect(affectsScoring(before, { fundingTotal: 45 } as any)).toBe(true);
    expect(affectsScoring(before, { sfda: "Pending" } as any)).toBe(true);
    expect(affectsScoring(before, { employees: 40 } as any)).toBe(true);
    expect(affectsScoring(before, { marketTam: "SAR 9B" } as any)).toBe(true);
    expect(affectsScoring(before, { team: [] } as any)).toBe(true);
    expect(affectsScoring(before, { rounds: [] } as any)).toBe(true);
  });
  it("StartupsService.update recalculates for a relevant change and skips a cosmetic one", async () => {
    const startupsRepo = fakeRepo([{ id: "s1", name: "Acme", slug: "acme", ...before }]);
    const scoringSvc: any = { recalculateStartupScore: jest.fn(async () => ({})) };
    const svc = new StartupsService(startupsRepo as any, fakeRepo() as any, fakeRepo() as any, {} as any, {} as any, {} as any, scoringSvc);
    await svc.update("s1", { tagline: "fresh tagline" } as any);
    expect(scoringSvc.recalculateStartupScore).not.toHaveBeenCalled();
    await svc.update("s1", { fundingTotal: 99 } as any);
    expect(scoringSvc.recalculateStartupScore).toHaveBeenCalledWith("s1", ScoreTrigger.STARTUP_UPDATED);
  });
});

// ---------------------------------------------------------------- the founder view
describe("owner assessment view", () => {
  const calc = (over: any = {}) => ({
    status: ScoreStatus.CALCULATED, ruwadScore: 8.1, confidenceScore: 0.82, version: "RUWAD-2.0", calculatedAt: new Date().toISOString(), missingFactors: [],
    factors: Object.fromEntries(["growth", "financial", "market", "team", "regulatory", "technology"].map((k) => [k, { score: 8, confidence: 0.8, reason: `${k} reason`, inputsUsed: [], missingInputs: [] }])), ...over,
  });
  const make = (score: any, pi: any = { models: [] }) => new StartupAssessmentService({ getScoreForStartup: async () => score } as any, { ownerView: async () => pi } as any);

  it("shows the score out of 10, six named factors, and data confidence", async () => {
    const a = await make(calc()).get("s1");
    expect(a.ruwadScore).toMatchObject({ state: "READY", value: 8.1, outOf: 10, dataConfidence: 0.82 });
    expect(a.factors.map((f) => f.label)).toEqual(["Growth Momentum", "Financial Strength", "Market Potential", "Team Strength", "Regulatory Readiness", "Technology Differentiation"]);
    expect(a.processing).toBe(false);
  });
  it("insufficient data shows Pending with the guidance message, never 0", async () => {
    const a = await make(calc({ status: ScoreStatus.INSUFFICIENT_DATA, ruwadScore: null, confidenceScore: null, factors: { ...calc().factors, growth: { score: null, confidence: 0, reason: "No growth data", inputsUsed: [], missingInputs: ["annualRevenue"] } } })).get("s1");
    expect(a.ruwadScore).toMatchObject({ state: "PENDING", value: null, dataConfidence: null, message: PENDING_MESSAGE });
    expect(a.ruwadScore.value).not.toBe(0);
    expect(a.factors.find((f) => f.key === "growth")?.score).toBeNull();
    expect(a.factors.filter((f) => f.score !== null).length).toBeGreaterThan(0); // factors that did compute are still shown
  });
  it("never-assessed startups are PROCESSING (the page polls), not 0 / 10", async () => {
    const a = await make(calc({ status: ScoreStatus.NOT_CALCULATED, ruwadScore: null, confidenceScore: null })).get("s1");
    expect(a.ruwadScore.state).toBe("PROCESSING");
    expect(a.processing).toBe(true);
  });
  it("an unavailable ML card never blocks the score", async () => {
    const a = await new StartupAssessmentService({ getScoreForStartup: async () => calc() } as any, { ownerView: async () => { throw new Error("db"); } } as any).get("s1");
    expect(a.ruwadScore.state).toBe("READY");
    expect(a.predictiveIntelligence.models).toEqual([]);
  });
  it("keeps the official score separate from the prediction: predictive data is its own block and never changes the score", async () => {
    const card = { target: "raisedNewRoundWithin6Months", title: "6-Month Funding Outlook", status: "AVAILABLE", estimatePercent: 40, experimental: true, includedInRuwadScore: false };
    const with_ = await make(calc(), { models: [card] }).get("s1");
    const without = await make(calc()).get("s1");
    expect(with_.ruwadScore).toEqual(without.ruwadScore);
    expect(with_.predictiveIntelligence.models[0]).toMatchObject({ includedInRuwadScore: false, experimental: true });
  });
});

describe("who may read an assessment (and so a prediction)", () => {
  const guard = new OwnershipGuard(new Reflector(), { isOwner: async (u: string, _k: string, id: string) => u === "owner" && id === "s1" } as any);
  const ctx = (user: any, id = "s1"): any => ({ getHandler: () => StartupAssessmentController.prototype.get, getClass: () => StartupAssessmentController, switchToHttp: () => ({ getRequest: () => ({ user, params: { id } }) }) });

  it("the route requires login and then ownership of that exact startup", () => {
    expect((Reflect.getMetadata("__guards__", StartupAssessmentController) as { name: string }[]).map((g) => g.name)).toEqual(["JwtAuthGuard", "OwnershipGuard"]);
    expect(Reflect.getMetadata(OWNED_ENTITY_KIND_KEY, StartupAssessmentController)).toBe(EntityKind.STARTUP);
  });
  it("the owner passes", async () => { await expect(guard.canActivate(ctx({ userId: "owner", role: UserRole.FOUNDER }))).resolves.toBe(true); });
  it("an admin passes", async () => {
    for (const role of [UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN]) await expect(guard.canActivate(ctx({ userId: "someone", role }))).resolves.toBe(true);
  });
  it("another signed-in user is refused", async () => {
    await expect(guard.canActivate(ctx({ userId: "stranger", role: UserRole.FOUNDER }))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx({ userId: "owner", role: UserRole.FOUNDER }, "someone-elses-startup"))).rejects.toThrow(ForbiddenException);
  });
  it("an anonymous request has no user and is refused", async () => { await expect(guard.canActivate(ctx(undefined))).resolves.toBe(false); });
});

describe("the public startup profile and the admin review queues stay out of the founder pipeline", () => {
  it("StartupsService.toDetail (the public payload) carries no prediction or Predictive Intelligence", async () => {
    const startup = { id: "s1", name: "Acme", verified: "unclaimed", fundingTotal: 10, valuation: 0, ruwadScore: 8.1, scoreStatus: ScoreStatus.CALCULATED };
    const shared = { getSectorNames: async () => [], getTeamMembers: async () => [], getProducts: async () => [], getContact: async () => null };
    const scoringSvc: any = { getScoreForStartup: async () => ({ status: ScoreStatus.CALCULATED, ruwadScore: 8.1, confidenceScore: 0.9, version: "v", calculatedAt: "", missingFactors: [], factors: { growth: { score: 8, confidence: 1, reason: "r", inputsUsed: [], missingInputs: [] } } }) };
    const svc = new StartupsService(fakeRepo([startup]) as any, fakeRepo() as any, fakeRepo() as any, shared as any, { findForTarget: async () => [] } as any, { pendingClaimForEntity: async () => false } as any, scoringSvc);
    const json = JSON.stringify(await svc.toDetail(startup as any));
    for (const leak of ["predictiveIntelligence", "estimatePercent", "Experimental", "inputFeatures", "modelVersion", "raisedNewRoundWithin6Months"]) expect(json).not.toContain(leak);
  });
  it("scoring, submission and assessment code does not depend on any admin ML review service or controller", () => {
    const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
    const forbidden = /historical-submission|ml-readiness|readiness-admin|ml-training|ml-dataset-export|outcome-events\.controller|ml-models\.controller|ml-data\.controller|historical\//;
    for (const f of ["scoring/scoring.service.ts", "scoring/startup-assessment.service.ts", "scoring/startup-assessment.controller.ts", "submissions/submissions.service.ts"]) {
      const imports = src(f).split("\n").filter((l) => /^import /.test(l)).join("\n");
      expect(imports).not.toMatch(forbidden);
    }
  });
  it("neither submitting nor scoring checks ADMIN_VERIFIED or any review status before producing a score", () => {
    const scoringSrc = readFileSync(join(__dirname, "scoring.service.ts"), "utf8");
    expect(scoringSrc).not.toMatch(/ADMIN_VERIFIED|HistoricalReviewStatus|reviewStatus|\.verified\s*===\s*true/);
    expect(Object.values(ScoreDataSource)).not.toContain("ADMIN_VERIFIED");
  });
});
