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
/** What a startup must now provide to be submitted: a team member, all traction answers, patents + regulatory status, a primary contact. */
const SUBMITTABLE_STARTUP = {
  category: "Digital Health", founders: [{ name: "Dana A", title: "CEO", isFounder: true }],
  annualRevenue: 0, previousAnnualRevenue: 0, recurringRevenue: 0, customerCount: 0, previousCustomerCount: 0, activeUsers: 0, partnershipsCount: 0, monthlyBurn: 0, cashAvailable: 0,
  patentsGranted: 0, patentsPending: 0, regulatoryMilestone: "applicability assessed",
  contactName: "Dana A", contactEmail: "dana@acme.example", contactPhone: "+966500000000", contactLinkedin: "https://linkedin.example/dana",
};

function submissions(kind: EntityKind, opts: { payload?: Record<string, unknown>; publishFails?: boolean; scoringFails?: boolean; scoring?: any } = {}) {
  const item: any = { id: "sub-1", userId: "founder-1", kind, status: SubmissionStatus.DRAFT, payload: opts.payload ?? (kind === EntityKind.STARTUP ? { name: "Acme", ...SUBMITTABLE_STARTUP } : { name: "Acme" }), title: "Acme" };
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
  const scoringSvc: any = opts.scoring ?? {
    assessStartup: jest.fn(async () => { if (opts.scoringFails) throw new Error("engine down"); return { status: ScoreStatus.CALCULATED }; }),
  };
  const publisher = (k: EntityKind) => ({ kind: k, publish: jest.fn(async () => { if (opts.publishFails) throw new Error("db"); return "startup-1"; }) });
  const publishers = [EntityKind.STARTUP, EntityKind.INVESTOR, EntityKind.HUB, EntityKind.RESEARCH, EntityKind.MULTINATIONAL].map(publisher);
  const svc = new SubmissionsService(
    repo, events, dataSource, { log: jest.fn(async () => undefined) } as any, {} as any,
    { findByIdOrThrow: jest.fn(async () => ({ firstName: "F", lastName: "O", email: "f@x.y" })) } as any, { sendStartupSubmissionReceived: jest.fn(async () => undefined) } as any,
    scoringSvc, { createSystemEventIfNew: jest.fn(async () => null) } as any,
    publishers[0] as any, publishers[1] as any, publishers[2] as any, publishers[3] as any, publishers[4] as any,
  );
  jest.spyOn(svc as any, "assertPayloadValid").mockResolvedValue(undefined);
  return { svc, item, memberships, reviewEvents, scoringSvc, dataSource, publishers, repo };
}

describe("startup submission: admin approval publishes, then scoring and ML run automatically", () => {
  type T = ReturnType<typeof submissions>;
  const submit = (t: T) => { t.item.status = SubmissionStatus.DRAFT; return t.svc.submit("founder-1", "sub-1"); };
  const nothingPublished = (t: T) => {
    for (const p of t.publishers) expect(p.publish).not.toHaveBeenCalled();
    expect(t.dataSource.transaction).not.toHaveBeenCalled();
    expect(t.memberships).toEqual([]);
    expect(t.scoringSvc.assessStartup).not.toHaveBeenCalled();
  };

  it("1+2. a founder's submit leaves the startup SUBMITTED and creates nothing public: no directory row, no owner, no score", async () => {
    for (const kind of [EntityKind.STARTUP, EntityKind.INVESTOR, EntityKind.HUB, EntityKind.RESEARCH, EntityKind.MULTINATIONAL]) {
      const t = submissions(kind);
      const out = await submit(t);
      expect(out.status).toBe(SubmissionStatus.SUBMITTED);
      expect(out.publishedEntityId).toBeUndefined();
      expect(t.reviewEvents.map((e) => e.eventType)).toEqual([SubmissionEventType.SUBMITTED]);
      nothingPublished(t);
    }
  });
  it("the founder cannot publish by any other route: re-submitting or approving their own submission is refused", async () => {
    const t = submissions(EntityKind.STARTUP);
    await submit(t);
    await expect(t.svc.submit("founder-1", "sub-1")).rejects.toThrow(); // SUBMITTED -> SUBMITTED is not allowed
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    await expect(t.svc.approve("founder-1", "sub-1")).rejects.toThrow(ForbiddenException);
    nothingPublished(t);
  });
  it("an admin who submitted a listing can approve it themselves: it publishes and they become its owner", async () => {
    const t = submissions(EntityKind.STARTUP);
    t.item.userId = "admin-1";
    (t.svc as any).usersService.findByIdOrThrow = jest.fn(async () => ({ id: "admin-1", role: UserRole.RUWAD_ADMIN }));
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    const out = await t.svc.approve("admin-1", "sub-1");
    expect(out.status).toBe(SubmissionStatus.APPROVED);
    expect(out.reviewedByUserId).toBe("admin-1");
    expect(t.publishers[0].publish).toHaveBeenCalledTimes(1);
    expect(t.memberships).toEqual([expect.objectContaining({ userId: "admin-1", kind: EntityKind.STARTUP, role: MembershipRole.OWNER })]);
  });
  it("3. an admin approving publishes the startup and makes the founder its owner", async () => {
    const t = submissions(EntityKind.STARTUP);
    await submit(t);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    const out = await t.svc.approve("admin-1", "sub-1");
    expect(out.status).toBe(SubmissionStatus.APPROVED);
    expect(out.publishedEntityId).toBe("startup-1");
    expect(out.reviewedByUserId).toBe("admin-1");
    expect(t.publishers[0].publish).toHaveBeenCalledTimes(1);
    expect(t.memberships).toEqual([expect.objectContaining({ userId: "founder-1", kind: EntityKind.STARTUP, entityId: "startup-1", role: MembershipRole.OWNER })]);
    expect(t.reviewEvents.find((e) => e.eventType === SubmissionEventType.APPROVED)).toMatchObject({ actorUserId: "admin-1" });
  });
  it("4+7. that single approval runs the existing scoring pipeline: founder/AI values first, then the score, with no second admin action", async () => {
    const t = submissions(EntityKind.STARTUP, { payload: { name: "Acme", ...SUBMITTABLE_STARTUP, annualRevenue: 1_000_000, customerCount: 40, aiFilledScoringKeys: ["customerCount"] } });
    await submit(t);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    await t.svc.approve("admin-1", "sub-1");
    // one call into the assessment pipeline (its internal order is asserted in founder-assessment.e2e.spec.ts)
    expect(t.scoringSvc.assessStartup).toHaveBeenCalledTimes(1);
    const [id, input] = t.scoringSvc.assessStartup.mock.calls[0];
    expect(id).toBe("startup-1");
    expect(input.trigger).toBe(ScoreTrigger.SUBMISSION_PUBLISHED);
    expect(input.founderPatch).toMatchObject({ annualRevenue: 1_000_000 });
    expect(input.aiPatch).toMatchObject({ customerCount: 40 });
  });
  it("5+6. approval -> official score saved -> experimental ML starts automatically; the owner then reads Score + Predictive Intelligence", async () => {
    const sc = scoring({ startupRow: { ...richStartup("startup-1") }, derived: RICH_FEATURES });
    const t = submissions(EntityKind.STARTUP, { scoring: sc.svc });
    await submit(t);
    expect(sc.history.rows).toHaveLength(0); // nothing scored before approval
    expect(sc.experimental.onFeaturesChanged).not.toHaveBeenCalled();
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    await t.svc.approve("admin-1", "sub-1");
    expect(sc.history.rows).toHaveLength(1);
    expect(sc.history.rows[0]).toMatchObject({ startupId: "startup-1", triggeredBy: ScoreTrigger.SUBMISSION_PUBLISHED });
    expect(sc.experimental.onFeaturesChanged).toHaveBeenCalledWith("startup-1");

    // what the founder is shown after approval: the official score and a separate experimental card
    const card = { target: "raisedNewRoundWithin6Months", title: "6-Month Funding Outlook", status: "AVAILABLE", estimatePercent: 30, experimental: true, includedInRuwadScore: false };
    const view = await new StartupAssessmentService(sc.svc, { ownerView: async () => ({ models: [card] }) } as any).get("startup-1");
    expect(view.ruwadScore.state).toBe("READY");
    expect(view.predictiveIntelligence.models[0]).toMatchObject({ experimental: true, includedInRuwadScore: false });
  });
  it("6. if the score cannot be calculated yet the founder sees Pending (never 0), and ML data gaps never block that", async () => {
    const sc = scoring({ startupRow: { id: "startup-1", name: "Bare", category: "Digital Health", sfda: "N/A", fda: "N/A", ce: "N/A", marketTam: "", marketSam: "", marketSom: "", fundingTotal: 0 } });
    const t = submissions(EntityKind.STARTUP, { scoring: sc.svc });
    await submit(t);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    await t.svc.approve("admin-1", "sub-1");
    const view = await new StartupAssessmentService(sc.svc, { ownerView: async () => ({ models: [] }) } as any).get("startup-1");
    expect(view.ruwadScore).toMatchObject({ state: "PENDING", value: null, message: PENDING_MESSAGE });
  });
  it("an ML failure after approval does not undo the publish or the score", async () => {
    const sc = scoring({ startupRow: { ...richStartup("startup-1") }, derived: RICH_FEATURES, experimental: { onFeaturesChanged: jest.fn(async () => { throw new Error("fastapi down"); }) } });
    const t = submissions(EntityKind.STARTUP, { scoring: sc.svc });
    await submit(t);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    const out = await t.svc.approve("admin-1", "sub-1");
    await new Promise((r) => setImmediate(r));
    expect(out.status).toBe(SubmissionStatus.APPROVED);
    expect(sc.history.rows).toHaveLength(1);
  });
  it("an assessment failure never undoes the publish", async () => {
    const t = submissions(EntityKind.STARTUP, { scoringFails: true });
    await submit(t);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    expect((await t.svc.approve("admin-1", "sub-1")).status).toBe(SubmissionStatus.APPROVED);
  });
  it("8. reject still works: the startup is never published and nothing is scored", async () => {
    const t = submissions(EntityKind.STARTUP);
    await submit(t);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    const out = await t.svc.reject("admin-1", "sub-1", { reason: "Not a healthcare company" } as any);
    expect(out.status).toBe(SubmissionStatus.REJECTED);
    expect(out.reviewerNote).toBe("Not a healthcare company");
    nothingPublished(t);
  });
  it("request-changes still works and the founder can resubmit; still nothing is published", async () => {
    const t = submissions(EntityKind.STARTUP);
    await submit(t);
    t.item.status = SubmissionStatus.UNDER_REVIEW;
    expect((await t.svc.requestChanges("admin-1", "sub-1", { message: "Add your team" } as any)).status).toBe(SubmissionStatus.CHANGES_REQUESTED);
    expect((await t.svc.submit("founder-1", "sub-1")).status).toBe(SubmissionStatus.SUBMITTED);
    nothingPublished(t);
  });
  it("9. the admin email Accept link works again: SUBMITTED -> review started -> approved -> published and scored, with that one click", async () => {
    const t = submissions(EntityKind.STARTUP);
    await submit(t);
    const out = await t.svc.decideFromEmail("admin-1", "accept-token-sid", "approve");
    expect(out.status).toBe(SubmissionStatus.APPROVED);
    expect(out.reviewedByUserId).toBe("admin-1");
    expect(t.publishers[0].publish).toHaveBeenCalledTimes(1);
    expect(t.scoringSvc.assessStartup).toHaveBeenCalledTimes(1);
  });
  it("9. the admin email Reject link works again and publishes nothing", async () => {
    const t = submissions(EntityKind.STARTUP);
    await submit(t);
    const out = await t.svc.decideFromEmail("admin-1", "reject-token-sid", "reject", "Duplicate listing");
    expect(out.status).toBe(SubmissionStatus.REJECTED);
    expect(out.reviewerNote).toBe("Duplicate listing");
    nothingPublished(t);
  });
  it("other listing kinds are unchanged: submit waits, admin approval publishes (with no startup scoring)", async () => {
    for (const [kind, idx] of [[EntityKind.INVESTOR, 1], [EntityKind.HUB, 2], [EntityKind.RESEARCH, 3], [EntityKind.MULTINATIONAL, 4]] as const) {
      const t = submissions(kind);
      expect((await submit(t)).status).toBe(SubmissionStatus.SUBMITTED);
      expect(t.publishers[idx].publish).not.toHaveBeenCalled();
      t.item.status = SubmissionStatus.UNDER_REVIEW;
      expect((await t.svc.approve("admin-1", "sub-1")).status).toBe(SubmissionStatus.APPROVED);
      expect(t.publishers[idx].publish).toHaveBeenCalledTimes(1);
      expect(t.scoringSvc.assessStartup).not.toHaveBeenCalled();
    }
  });
  it("there is no auto-publish path left in the submission service", () => {
    const src = readFileSync(join(__dirname, "..", "submissions", "submissions.service.ts"), "utf8");
    expect(src).not.toMatch(/autoPublish|Published automatically|reviewerUserId:\s*null/);
    const submitBody = src.slice(src.indexOf("async submit("), src.indexOf("// ------------------------------------------------------------- admin-side"));
    expect(submitBody).not.toMatch(/publishItem|publisher\.publish|assessStartup|recalculateStartupScore/);
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
    status: ScoreStatus.CALCULATED, ruwadScore: 8.1, confidenceScore: 0.82, version: "RUWAD-2.0", calculatedAt: "2026-10-05T00:00:00.000Z", missingFactors: [],
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
    const startup = { id: "s1", name: "Acme", verified: "unclaimed", fundingTotal: 10, valuation: 0, ruwadScore: 8.1, scoreStatus: ScoreStatus.CALCULATED, scoringBasis: "EXISTING_DATA" };
    const shared = { getSectorNames: async () => [], getTeamMembers: async () => [], getProducts: async () => [], getContact: async () => null };
    const scoringSvc: any = { getScoreForStartup: async () => ({ status: ScoreStatus.CALCULATED, ruwadScore: 8.1, confidenceScore: 0.9, version: "v", calculatedAt: "", missingFactors: [], factors: { growth: { score: 8, confidence: 1, reason: "r", inputsUsed: [], missingInputs: [] } } }) };
    const svc = new StartupsService(fakeRepo([startup]) as any, fakeRepo() as any, fakeRepo() as any, shared as any, { findForTarget: async () => [] } as any, { pendingClaimForEntity: async () => false } as any, scoringSvc);
    const json = JSON.stringify(await svc.toDetail(startup as any));
    for (const leak of ["predictiveIntelligence", "estimatePercent", "Experimental", "inputFeatures", "modelVersion", "raisedNewRoundWithin6Months", "scoringBasis", "EXISTING_DATA"]) expect(json).not.toContain(leak);
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
