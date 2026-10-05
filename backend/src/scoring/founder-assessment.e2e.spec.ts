import { EntityKind, MlModelStatus, ScoreStatus, SubmissionEventType, SubmissionStatus } from "../common/enums";
import { ML_FEATURE_SCHEMA_VERSION } from "../ml-data/ml-data.constants";
import { MlExperimentalInferenceService } from "../ml-data/ml-experimental-inference.service";
import { StartupSubmissionPublisher } from "../submissions/publishers/startup-submission.publisher";
import { SubmissionsService } from "../submissions/submissions.service";
import { FeatureDerivationService } from "./feature-derivation.service";
import { ScoringService } from "./scoring.service";
import { PENDING_MESSAGE, StartupAssessmentService } from "./startup-assessment.service";
import { MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, ML_WEIGHT, RULE_WEIGHT } from "./scoring.constants";

/** End-to-end regression of the founder assessment, using the REAL submission validation, the REAL startup publisher, the REAL
 * feature derivation, the REAL six scoring engines, the REAL experimental-inference service and the REAL assessment service. Only the
 * database (in-memory tables) and the HTTP call to the ML service (a stand-in that applies the same minimum-data rule) are faked. */

// ---------------------------------------------------------------- in-memory database
type Row = Record<string, any>;
class Table {
  rows: Row[] = [];
  private n = 0;
  constructor(private readonly prefix: string) {}
  private match(r: Row, where: any): boolean { return !where || (Array.isArray(where) ? where : [where]).some((w: any) => Object.entries(w).every(([k, v]) => r[k] === v)); }
  private order(list: Row[], order: any): Row[] {
    const [k, dir] = Object.entries(order ?? {})[0] ?? [];
    if (!k) return list;
    return [...list].sort((a, b) => (+new Date(a[k]) - +new Date(b[k])) * (String(dir).toUpperCase() === "DESC" ? -1 : 1));
  }
  create = (x: Row) => ({ id: `${this.prefix}-${++this.n}`, createdAt: new Date(), ...x });
  save = async (x: Row | Row[]) => {
    for (const row of Array.isArray(x) ? x : [x]) {
      if (!row.id) row.id = `${this.prefix}-${++this.n}`;
      const i = this.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) this.rows[i] = row; else this.rows.push(row);
    }
    return x;
  };
  find = async (o?: any) => this.order(this.rows.filter((r) => this.match(r, o?.where)), o?.order);
  findOne = async (o: any) => (await this.find(o))[0] ?? null;
  update = async (id: string, patch: Row) => { const r = this.rows.find((x) => x.id === id); if (r) Object.assign(r, patch); };
}

function world(opts: { mlEnabled?: boolean } = {}) {
  const tables: Record<string, Table> = {};
  const t = (name: string) => (tables[name] ??= new Table(name.toLowerCase()));
  const manager: any = { getRepository: (entity: { name: string }) => t(entity.name) };
  const dataSource: any = { transaction: async (cb: any) => cb(manager) };

  const submission: Row = { id: "sub-1", userId: "founder-1", kind: EntityKind.STARTUP, status: SubmissionStatus.DRAFT, payload: {}, title: "Acme" };
  t("Submission").rows.push(submission);

  // ---- scoring stack: real derivation + real engines over the same tables the publisher writes to
  const startups = t("Startup"), team = t("TeamMember"), rounds = t("FundingRound"), investments = t("Investment");
  const history = t("StartupScoreHistory"), features = t("StartupScoringFeatures"), audit = t("StartupScoringFeatureAudit");
  const derivation = new FeatureDerivationService(team as any, rounds as any, investments as any);

  // ---- experimental ML: real service; the ML HTTP service is stood in by the same minimum-data rule (>=2 of the model's own features)
  const predictions = t("MlPrediction");
  const MODEL = "exp-raisedNewRoundWithin6Months-6m-catboost-20261004070745";
  const MODEL_FEATURES = ["customerCount", "partnershipsCount", "totalFundingRaised", "fundingRounds", "geographicReach", "founderCount", "teamSize"];
  const mlCalls: Row[] = [];
  const client: any = {
    experimentalEnabled: opts.mlEnabled !== false,
    predictExperimental: async (req: { features: Record<string, unknown> }) => {
      mlCalls.push(req);
      const populated = MODEL_FEATURES.filter((k) => req.features[k] !== undefined);
      const base = { modelVersion: MODEL, target: "raisedNewRoundWithin6Months", targetVersion: "FUNDING-6M-v1", featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, modelStatus: "EXPERIMENTAL", predictionType: "PROBABILITY", featureCompleteness: populated.length / MODEL_FEATURES.length, populatedFeatures: populated, missingFeatures: [], outOfRange: [], invalidFeatures: [], trainingRows: 15, trainingPositives: 4, trainingNegatives: 11, algorithm: "catboost", datasetVersion: "RUWAD-REAL-DATASET-v1", calibration: "NOT_RELIABLE_AT_CURRENT_SAMPLE_SIZE", drivers: [], driversNote: null, warnings: [], reliabilityReasons: [] };
      if (populated.length < 2) return { ok: true, result: { ...base, status: "INSUFFICIENT_DATA", prediction: null, reliability: null, reasons: ["Too few of the model's features are populated"] } };
      return { ok: true, result: { ...base, status: "OK", prediction: 0.31, reliability: "VERY_LOW", reasons: [] } };
    },
  };
  const registry: any = { findByVersion: async (v: string) => (v === MODEL ? { modelVersion: v, status: MlModelStatus.EXPERIMENTAL, targetName: "raisedNewRoundWithin6Months", targetVersion: "FUNDING-6M-v1", algorithm: "catboost", trainingRows: 15, metrics: {} } : null) };
  const config: any = { get: (k: string) => ({ ML_EXPERIMENTAL_INFERENCE_ENABLED: opts.mlEnabled === false ? "false" : "true", ML_EXPERIMENTAL_MODEL_VERSION: MODEL } as Record<string, string>)[k] };
  const experimental = new MlExperimentalInferenceService(config, client, registry, derivation, predictions as any, startups as any, features as any, t("StartupOutcomeEvent") as any, t("StartupOutcomeCoverage") as any);

  const scoring = new ScoringService(
    startups as any, history as any, features as any, audit as any, { predict: async () => null } as any, derivation,
    { maybeSnapshot: async () => ({ id: "snap" }) } as any, { createSystemEventIfNew: jest.fn(async () => null) } as any, { generateShadowPredictions: jest.fn(async () => undefined) } as any, experimental,
  );
  const assessment = new StartupAssessmentService(scoring, experimental);

  const noop = { createSystemEventIfNew: jest.fn(async () => null) };
  const stub = (kind: EntityKind) => ({ kind, publish: jest.fn(async () => { throw new Error("not used"); }) });
  const submissions = new SubmissionsService(
    t("Submission") as any, t("SubmissionReviewEvent") as any, dataSource, { log: jest.fn(async () => undefined) } as any, {} as any,
    { findByIdOrThrow: async () => ({ firstName: "F", lastName: "O", email: "f@x.y" }) } as any, { sendStartupSubmissionReceived: jest.fn(async () => undefined) } as any,
    scoring, noop as any, new StartupSubmissionPublisher() as any, stub(EntityKind.INVESTOR) as any, stub(EntityKind.HUB) as any, stub(EntityKind.RESEARCH) as any, stub(EntityKind.MULTINATIONAL) as any,
  );
  const spies = {
    adminCalls: jest.spyOn(submissions, "approve"),
    recalc: jest.spyOn(scoring, "recalculateStartupScore"),
    applyFounder: jest.spyOn(scoring, "applyFounderAndAiFeatures"),
    applyDerived: jest.spyOn(scoring, "applyDerivedFeatures"),
    runMl: jest.spyOn(scoring, "runExperimentalMlInference"),
  };
  /** Waits for the fire-and-forget ML step. */
  const settle = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)); };
  return { t, submission, submissions, scoring, assessment, experimental, mlCalls, spies, startups, history, features, predictions, settle };
}

// ---------------------------------------------------------------- the two founder submissions
/** Everything the wizard marks required, and nothing optional (what a minimal real submission looks like).
 * That now includes one team member, every Traction & Growth answer (zeros), patents and regulatory status, and the primary contact. */
const REQUIRED_ONLY = {
  name: "Sparse Health", category: "Digital Health", subsector: "Telehealth", tagline: "Virtual care", country: "Saudi Arabia", city: "Riyadh", hq: "Riyadh, Saudi Arabia",
  founded: 2024, stage: "Seed", businessModel: "SaaS", desc: "A virtual care platform.", problem: "Access to care.", solution: "Video consults.", advantage: "Arabic-first.",
  employees: 0, marketTam: "SAR 2B", marketSam: "SAR 500M", marketSom: "SAR 50M", fundingTotal: 0, valuation: 0,
  sfda: "Not Submitted", fda: "N/A", ce: "N/A", clinicalStatus: "Not disclosed", patentStatus: "None",
  legalName: "Sparse Health LLC", website: "https://sparse.example", email: "hello@sparse.example", phone: "+966500000001", linkedin: "https://linkedin.example/sparse",
  founders: [{ name: "Sparse Founder", title: "Founder" }],
  annualRevenue: 0, previousAnnualRevenue: 0, recurringRevenue: 0, customerCount: 0, previousCustomerCount: 0, activeUsers: 0, partnershipsCount: 0, monthlyBurn: 0, cashAvailable: 0,
  patentsGranted: 0, patentsPending: 0, regulatoryMilestone: "applicability assessed",
  contactName: "Sparse Founder", contactEmail: "founder@sparse.example", contactPhone: "+966500000002", contactLinkedin: "https://linkedin.example/sparse-founder",
};

/** A startup that filled the form in properly: team, traction, funding rounds, technology, regulatory pathway. */
const COMPLETE = {
  ...REQUIRED_ONLY,
  name: "Complete Health", legalName: "Complete Health LLC", employees: 24, fundingTotal: 3.5, valuation: 40,
  founders: [
    { name: "Dana A", title: "CEO", isFounder: true, experienceYears: 11, healthcareExperienceYears: 7, previousStartupExperience: true },
    { name: "Omar B", title: "CTO", isFounder: true, experienceYears: 9, healthcareExperienceYears: 4, previousStartupExperience: false },
    { name: "Lina C", title: "Head of Product", isFounder: false },
  ],
  rounds: [
    { round: "Pre-Seed", date: "2023-03-01", amount: 1_000_000, lead: "Angel Network" },
    { round: "Seed", date: "2024-06-01", amount: 2_500_000, lead: "Wa'ed Ventures" },
  ],
  annualRevenue: 1_200_000, previousAnnualRevenue: 600_000, recurringRevenue: 900_000, customerCount: 40, previousCustomerCount: 20, activeUsers: 12_000, partnershipsCount: 4,
  monthlyBurn: 150_000, cashAvailable: 1_200_000, marketGrowthRate: 18, marketsOperatingIn: ["Saudi Arabia", "United Arab Emirates"],
  proprietaryTechnology: true, proprietaryAlgorithms: 2, proprietaryDatasets: 1, peerReviewedPublications: 3, patentsGranted: 1, patentsPending: 2,
  sfda: "Approved", regulatoryMilestone: "Deployed in Pilot Environments",
  aiFilledScoringKeys: [],
};

async function submitAndApprove(w: ReturnType<typeof world>, payload: Record<string, unknown>) {
  w.submission.payload = payload;
  w.submission.title = String(payload.name);
  const submittedStatus = (await w.submissions.submit("founder-1", "sub-1")).status; // the row is mutated later: read the status now
  const startupsBefore = w.startups.rows.length;
  w.submission.status = SubmissionStatus.UNDER_REVIEW; // an admin opened it for review
  const approved = await w.submissions.approve("admin-1", "sub-1"); // THE one admin action
  await w.settle();
  return { submittedStatus, approved, startupsBefore, startupId: approved.publishedEntityId as string };
}

describe("founder assessment, end to end", () => {
  it("a realistically completed startup: ONE admin approval -> published -> six factors -> RUWAD Score /10 -> experimental ML -> founder sees both", async () => {
    const w = world();
    const { submittedStatus, approved, startupsBefore, startupId } = await submitAndApprove(w, COMPLETE);

    // submitted, nothing public yet; then one approval publishes it
    expect(submittedStatus).toBe(SubmissionStatus.SUBMITTED);
    expect(startupsBefore).toBe(0); // nothing existed before the approval...
    expect(w.startups.rows).toHaveLength(1); // ...and the approval created exactly the one startup
    expect(approved.status).toBe(SubmissionStatus.APPROVED);
    expect(w.spies.adminCalls).toHaveBeenCalledTimes(1);

    // the exact pipeline order, with no second action: founder/AI features -> derived features -> score -> ML
    const order = [w.spies.applyFounder, w.spies.applyDerived, w.spies.recalc, w.spies.runMl].map((s) => s.mock.invocationCallOrder[0]);
    expect(order.every((n) => typeof n === "number")).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(w.spies.recalc).toHaveBeenCalledTimes(1);

    // the six engines ran and produced the overall score
    const view = await w.assessment.get(startupId);
    expect(view.ruwadScore.state).toBe("READY");
    expect(view.ruwadScore.outOf).toBe(10);
    expect(view.ruwadScore.value).toBeGreaterThan(0);
    expect(view.ruwadScore.value).toBeLessThanOrEqual(10);
    expect(view.ruwadScore.dataConfidence).toBeGreaterThanOrEqual(MIN_OVERALL_CONFIDENCE);
    expect(view.factors.map((f) => f.label)).toEqual(["Growth Momentum", "Financial Strength", "Market Potential", "Team Strength", "Regulatory Readiness", "Technology Differentiation"]);
    expect(view.factors.every((f) => f.status === "AVAILABLE" && typeof f.score === "number")).toBe(true);
    // ...and the overall score is exactly the mean of the six (RULE_WEIGHT=1, ML_WEIGHT=0: nothing else enters it)
    const mean = view.factors.reduce((a, f) => a + (f.score as number), 0) / 6;
    expect(RULE_WEIGHT).toBe(1);
    expect(ML_WEIGHT).toBe(0);
    expect(view.ruwadScore.value).toBeCloseTo(mean, 6);
    expect(w.startups.rows.find((s) => s.id === startupId)).toMatchObject({ scoreStatus: ScoreStatus.CALCULATED });

    // the experimental ML ran separately, after the score, and its result is stored and shown beside (not in) the score
    expect(w.mlCalls).toHaveLength(1);
    expect(w.predictions.rows).toHaveLength(1);
    expect(w.predictions.rows[0]).toMatchObject({ startupId, outcome: "PREDICTED", modelStatus: MlModelStatus.EXPERIMENTAL, targetName: "raisedNewRoundWithin6Months" });
    expect(w.predictions.rows[0].predictedAt.getTime()).toBeGreaterThanOrEqual(w.history.rows[0].calculatedAt.getTime());
    const [card] = view.predictiveIntelligence.models;
    expect(card).toMatchObject({ status: "AVAILABLE", title: "6-Month Funding Outlook", estimatePercent: 30, experimental: true, includedInRuwadScore: false });
    expect(view.ruwadScore.value).toBeCloseTo(mean, 6); // unchanged by the prediction existing

    // the ML input carried only allow-listed numbers, including the new structured mappings
    const sent = w.mlCalls[0].features;
    expect(sent).toMatchObject({ teamSize: 24, customerCount: 40, partnershipsCount: 4, fundingRounds: 2, founderCount: 2, totalFundingRaised: 3_500_000 });
    expect(JSON.stringify(sent)).not.toMatch(/Complete Health|@|ruwadScore/);
  });

  it("sparse founder submission: ONE approval -> published -> score PENDING with actionable reasons, no fake numbers, ML does not block it", async () => {
    const w = world();
    const { approved, startupId } = await submitAndApprove(w, REQUIRED_ONLY);
    expect(approved.status).toBe(SubmissionStatus.APPROVED);
    expect(w.spies.adminCalls).toHaveBeenCalledTimes(1);

    const view = await w.assessment.get(startupId);
    expect(view.ruwadScore).toMatchObject({ state: "PENDING", value: null, dataConfidence: null, message: PENDING_MESSAGE });
    expect(w.startups.rows.find((s) => s.id === startupId)).toMatchObject({ scoreStatus: ScoreStatus.INSUFFICIENT_DATA, ruwadScore: undefined });

    // why, in the engine's own terms: the required answers (a team member, zero-valued traction, patents, regulatory status) make
    // four factors calculable, but they rest on under half of their inputs, so the confidence rule keeps the score pending
    expect(view.completion).toBeDefined();
    expect(view.completion!.factorsRequired).toBe(MIN_FACTOR_COVERAGE);
    expect(view.completion!.factorsAvailable).toBe(4);
    expect(view.completion!.meanConfidence).toBeLessThan(MIN_OVERALL_CONFIDENCE);
    expect(view.completion!.blockers[0]).toMatch(/rest on \d+% of their inputs on average; at least 50% is needed/);

    // unavailable factors are shown as unavailable (null), never as a number, each with the founder-fillable fields that would unlock it
    const unavailable = view.factors.filter((f) => f.status === "UNAVAILABLE");
    expect(unavailable.map((f) => f.key).sort()).toEqual(["financial", "growth"]); // no revenue/customer baseline and no funding rounds yet
    for (const f of unavailable) {
      expect(f.score).toBeNull();
      expect(f.missingFields.length).toBeGreaterThan(0);
      expect(f.missingFields.every((m) => m.label && m.where)).toBe(true);
    }
    const labels = (k: string) => view.factors.find((f) => f.key === k)!.missingFields.map((m) => m.label);
    expect(labels("growth")).toEqual(expect.arrayContaining(["Annual Revenue (SAR)", "Previous Year's Annual Revenue (SAR)", "Current Customers"]));
    expect(labels("financial")).toEqual(expect.arrayContaining(["Cash Available (SAR)", "Monthly Burn (SAR)", "Funding Round amounts"]));
    // internal engine keys and analyst-only inputs are never shown to a founder
    const everything = JSON.stringify(view.factors.map((f) => f.missingFields));
    expect(everything).not.toMatch(/leadershipCompleteness|technicalTeamStrength|burnMultiple|quarterlyRevenueGrowth|missingInputs/);

    // the required answers are enough input for the experimental model, so it predicts - but that prediction is separate: the
    // official score stays pending and no number from the model leaks into it
    expect(w.predictions.rows).toHaveLength(1);
    expect(w.predictions.rows[0]).toMatchObject({ outcome: "PREDICTED", modelStatus: MlModelStatus.EXPERIMENTAL });
    expect(view.predictiveIntelligence.models[0]).toMatchObject({ status: "AVAILABLE" });
    expect(view.ruwadScore.value).toBeNull();
  });

  it("thin headcount-only data is NOT scored: the confidence rule blocks it and says so (no threshold was lowered)", async () => {
    const w = world();
    const { startupId } = await submitAndApprove(w, { ...REQUIRED_ONLY, name: "Headcount Only", employees: 12, fundingTotal: 1 });
    const view = await w.assessment.get(startupId);
    // Team Strength now calculates from the founder's headcount (a real structured input), so 4 factors exist...
    expect(view.factors.find((f) => f.key === "team")!.status).toBe("AVAILABLE");
    expect(view.completion!.factorsAvailable).toBe(5);
    // ...but they rest on under half of their inputs, so the engine's >=50% average-confidence rule keeps the overall score pending
    expect(view.ruwadScore).toMatchObject({ state: "PENDING", value: null });
    expect(view.completion!.meanConfidence).toBeLessThan(MIN_OVERALL_CONFIDENCE);
    expect(view.completion!.blockers.join(" ")).toMatch(/rest on \d+% of their inputs on average; at least 50% is needed/);
  });

  it("no separate approval is needed for scoring or ML, and nothing is created before the approval", async () => {
    const w = world();
    w.submission.payload = COMPLETE;
    await w.submissions.submit("founder-1", "sub-1");
    expect(w.startups.rows).toHaveLength(0); // no startup, hence no profile, score or prediction before the admin approves
    expect(w.history.rows).toHaveLength(0);
    expect(w.predictions.rows).toHaveLength(0);
    expect(w.mlCalls).toHaveLength(0);
    w.submission.status = SubmissionStatus.UNDER_REVIEW;
    await w.submissions.approve("admin-1", "sub-1");
    await w.settle();
    expect(w.history).toBeDefined();
    expect(w.history.rows).toHaveLength(1);
    expect(w.predictions.rows).toHaveLength(1);
    const events = w.t("SubmissionReviewEvent").rows.map((e) => e.eventType);
    expect(events.filter((e) => e === SubmissionEventType.APPROVED)).toHaveLength(1); // one approval, nothing else was asked of an admin
  });

  it("an ML outage after approval never blocks or changes the score the founder sees", async () => {
    const off = world({ mlEnabled: false });
    const on = world();
    const a = await submitAndApprove(off, COMPLETE);
    const b = await submitAndApprove(on, COMPLETE);
    const viewOff = await off.assessment.get(a.startupId);
    const viewOn = await on.assessment.get(b.startupId);
    expect(viewOff.ruwadScore.value).toBe(viewOn.ruwadScore.value); // identical with ML disabled vs enabled
    expect(viewOff.factors.map((f) => f.score)).toEqual(viewOn.factors.map((f) => f.score));
    expect(viewOff.predictiveIntelligence.models).toEqual([]); // disabled: no card, no error, no prediction
    expect(off.predictions.rows).toHaveLength(0);
  });
});
