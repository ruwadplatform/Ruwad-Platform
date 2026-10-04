import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../common/guards/roles.guard";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { MlModelStatus, UserRole } from "../common/enums";
import { ML_WEIGHT, RULE_WEIGHT } from "../scoring/scoring.constants";
import { ML_FEATURE_SCHEMA_VERSION } from "./ml-data.constants";
import { MlInferenceClient } from "./ml-inference-client";
import { MlExperimentalInferenceService } from "./ml-experimental-inference.service";
import { ExperimentalMlController } from "./experimental-ml.controller";
import { assembleInput, bucketFor, emptyDistribution, inputHash } from "./experimental-inference.logic";

const MODEL = "exp-raisedNewRoundWithin6Months-6m-catboost-20261004070745";
const S1 = "11111111-1111-4111-8111-111111111111";
const GOOD = { fundingRounds: 1, teamSize: 20, founderCount: 2 };

const okResult = (over: Record<string, unknown> = {}) => ({
  status: "OK", modelVersion: MODEL, target: "raisedNewRoundWithin6Months", targetVersion: "FUNDING-6M-v1", featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
  modelStatus: "EXPERIMENTAL", prediction: 0.31, predictionType: "PROBABILITY", reliability: "LOW", reliabilityReasons: [], featureCompleteness: 0.43,
  populatedFeatures: Object.keys(GOOD), missingFeatures: [], outOfRange: [], invalidFeatures: [], reasons: [], trainingRows: 15, trainingPositives: 4, trainingNegatives: 11,
  algorithm: "catboost", datasetVersion: "RUWAD-REAL-DATASET-v1", calibration: "NOT_RELIABLE_AT_CURRENT_SAMPLE_SIZE", drivers: [], driversNote: null, warnings: [], ...over,
});

interface Setup { svc: MlExperimentalInferenceService; client: any; saved: any[]; predictions: any; stored: any[] }

function build(opts: { env?: Record<string, string>; modelStatus?: MlModelStatus | null; call?: any; features?: any; existing?: any[]; startups?: any[]; clientEnabled?: boolean } = {}): Setup {
  const env: Record<string, string> = { ML_EXPERIMENTAL_INFERENCE_ENABLED: "true", EXPERIMENTAL_MODEL_VERSION: MODEL, ...(opts.env ?? {}) };
  const config: any = { get: (k: string) => env[k] };
  const stored: any[] = [...(opts.existing ?? [])];
  const saved: any[] = [];
  const client: any = { experimentalEnabled: opts.clientEnabled ?? true, predictExperimental: jest.fn(opts.call ?? (async () => ({ ok: true, result: okResult() }))) };
  const registry: any = { findByVersion: jest.fn(async (v: string) => (opts.modelStatus === null || v !== MODEL ? null : { modelVersion: v, status: opts.modelStatus ?? MlModelStatus.EXPERIMENTAL, algorithm: "catboost", trainingRows: 15, targetName: "raisedNewRoundWithin6Months", targetVersion: "FUNDING-6M-v1", metrics: {} })) };
  const derivation: any = { deriveScoringFeatures: jest.fn(async () => opts.features ?? GOOD) };
  const predictions: any = {
    create: (x: any) => ({ id: `p${stored.length + saved.length + 1}`, ...x }),
    save: jest.fn(async (x: any) => { saved.push(x); stored.push(x); return x; }),
    findOne: jest.fn(async ({ where, order }: any) => {
      const hits = stored.filter((p) => p.startupId === where.startupId && p.modelVersion === where.modelVersion && (where.inputHash === undefined || p.inputHash === where.inputHash));
      return (order?.predictedAt === "DESC" ? [...hits].sort((a, b) => +b.predictedAt - +a.predictedAt) : hits)[0] ?? null;
    }),
    find: jest.fn(async () => stored),
  };
  const startups: any = { findOne: jest.fn(async () => ({ id: S1, name: "Acme", employees: null, category: "DIGITAL_HEALTH" })), find: jest.fn(async () => opts.startups ?? [{ id: S1, name: "Acme" }]) };
  const scoringFeatures: any = { findOne: jest.fn(async () => null) };
  const events: any = { find: jest.fn(async () => []) };
  const coverage: any = { find: jest.fn(async () => []) };
  const svc = new MlExperimentalInferenceService(config, client, registry, derivation, predictions, startups, scoringFeatures, events, coverage);
  return { svc, client, saved, predictions, stored };
}

describe("experimental inference — flags and model selection", () => {
  it("is disabled by default: no call, nothing stored", async () => {
    const t = build({ env: { ML_EXPERIMENTAL_INFERENCE_ENABLED: "false" } });
    expect((await t.svc.run(S1)).status).toBe("DISABLED");
    expect(t.client.predictExperimental).not.toHaveBeenCalled();
    expect(t.saved).toHaveLength(0);
  });
  it("anything other than the exact string 'true' keeps it off", async () => {
    for (const v of ["TRUE", "1", "yes", ""]) expect(build({ env: { ML_EXPERIMENTAL_INFERENCE_ENABLED: v } }).svc.isEnabled()).toBe(false);
  });
  it("is off when the client itself is not configured (no URL/token), even if the flag is true", async () => {
    const t = build({ clientEnabled: false });
    expect((await t.svc.run(S1)).status).toBe("DISABLED");
    expect(t.saved).toHaveLength(0);
  });
  it("does not depend on ML_SCORING_ENABLED, and ML_SCORING_ENABLED alone never enables it", () => {
    const mk = (env: Record<string, string | undefined>) => new MlInferenceClient({ get: (k: string) => env[k] } as any);
    const base = { ML_SCORING_SERVICE_URL: "http://127.0.0.1:8001", ML_SERVICE_TOKEN: "t" };
    expect(mk({ ...base, ML_SCORING_ENABLED: "true" }).experimentalEnabled).toBe(false);
    expect(mk({ ...base, ML_SCORING_ENABLED: "false", ML_EXPERIMENTAL_INFERENCE_ENABLED: "true" }).experimentalEnabled).toBe(true);
    expect(mk({ ...base, ML_SCORING_ENABLED: "false", ML_EXPERIMENTAL_INFERENCE_ENABLED: "true" }).enabled).toBe(false);
    expect(mk({ ML_EXPERIMENTAL_INFERENCE_ENABLED: "true", ML_SERVICE_TOKEN: "t" }).experimentalEnabled).toBe(false); // no URL
    expect(mk({ ML_EXPERIMENTAL_INFERENCE_ENABLED: "true", ML_SCORING_SERVICE_URL: "http://x" }).experimentalEnabled).toBe(false); // no token
  });
  it("never picks a model on its own: no EXPERIMENTAL_MODEL_VERSION -> nothing runs", async () => {
    const t = build({ env: { EXPERIMENTAL_MODEL_VERSION: "" } });
    const out = await t.svc.run(S1);
    expect(out.status).toBe("MODEL_UNAVAILABLE");
    expect(t.client.predictExperimental).not.toHaveBeenCalled();
  });
  it.each([MlModelStatus.ACTIVE, MlModelStatus.SHADOW, MlModelStatus.TEST_ONLY])("refuses a %s model: the model status must be EXPERIMENTAL", async (status) => {
    const t = build({ modelStatus: status });
    expect((await t.svc.run(S1)).status).toBe("MODEL_UNAVAILABLE");
    expect(t.client.predictExperimental).not.toHaveBeenCalled();
    expect(t.saved).toHaveLength(0);
  });
  it("an unregistered model is refused", async () => {
    expect((await build({ modelStatus: null }).svc.run(S1)).status).toBe("MODEL_UNAVAILABLE");
  });
});

describe("experimental inference — prediction, storage and de-duplication", () => {
  it("stores one EXPERIMENTAL row with schema, completeness, reliability and the exact input; the model is asked by the configured version", async () => {
    const t = build();
    const out = await t.svc.run(S1);
    expect(out.status).toBe("PREDICTED");
    expect(t.saved).toHaveLength(1);
    const row = t.saved[0];
    expect(row).toMatchObject({ startupId: S1, modelVersion: MODEL, modelStatus: MlModelStatus.EXPERIMENTAL, featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, featureCompleteness: 0.43, reliability: "LOW", prediction: 0.31 });
    expect(row.snapshotId).toBeUndefined();
    expect(row.predictedAt).toBeInstanceOf(Date);
    expect(t.client.predictExperimental).toHaveBeenCalledWith(expect.objectContaining({ startupId: S1, featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION }), MODEL);
  });
  it("sends only allow-listed numeric/boolean features: no names, contacts, text, RUWAD score or factor scores", async () => {
    const t = build({ features: { ...GOOD, ruwadScore: 77, factorScores: { team: 5 }, startupName: "Acme", email: "a@b.c", pitchDeckText: "secret", regulatoryMilestone: "FDA cleared", annualRevenue: 9e6 } });
    await t.svc.run(S1);
    const sent = t.client.predictExperimental.mock.calls[0][0];
    expect(sent.startupId).toBe(S1);
    for (const v of Object.values(sent.features)) expect(["number", "boolean"]).toContain(typeof v);
    for (const banned of ["ruwadScore", "factorScores", "startupName", "email", "pitchDeckText", "regulatoryMilestone", "name", "phone"]) expect(sent.features).not.toHaveProperty(banned);
    expect(Object.keys(sent)).toEqual(["startupId", "featureSchemaVersion", "features"]);
  });
  it("opening a page twice does not add a row: the same input is UNCHANGED and the model is not called again", async () => {
    const t = build();
    await t.svc.run(S1);
    const second = await t.svc.run(S1);
    expect(second.status).toBe("UNCHANGED");
    expect(t.client.predictExperimental).toHaveBeenCalledTimes(1);
    expect(t.saved).toHaveLength(1);
  });
  it("a meaningful feature change creates a NEW row and keeps the old one", async () => {
    const t = build();
    await t.svc.run(S1);
    const first = t.saved[0];
    const t2 = build({ existing: [first], features: { ...GOOD, fundingRounds: 3 }, call: async () => ({ ok: true, result: okResult({ prediction: 0.5 }) }) });
    expect((await t2.svc.run(S1)).status).toBe("PREDICTED");
    expect(t2.stored).toHaveLength(2);
    expect(t2.stored[0].prediction).toBe(0.31); // history preserved
  });
  it("an explicit admin refresh stores a fresh row even when nothing changed", async () => {
    const t = build();
    await t.svc.run(S1);
    expect((await t.svc.run(S1, { force: true })).status).toBe("PREDICTED");
    expect(t.saved).toHaveLength(2);
  });
  it("a different model version is never treated as a duplicate", () => {
    expect(inputHash(S1, "m1", ML_FEATURE_SCHEMA_VERSION, GOOD)).not.toBe(inputHash(S1, "m2", ML_FEATURE_SCHEMA_VERSION, GOOD));
    expect(inputHash(S1, "m1", ML_FEATURE_SCHEMA_VERSION, { a: 1, b: 2 })).toBe(inputHash(S1, "m1", ML_FEATURE_SCHEMA_VERSION, { b: 2, a: 1 }));
  });
});

describe("experimental inference — gates and failures never escape", () => {
  it("INSUFFICIENT_DATA from the service records a marker with NO number (never a fallback), and the same input is not sent again", async () => {
    const t = build({ call: async () => ({ ok: true, result: okResult({ status: "INSUFFICIENT_DATA", prediction: null, reliability: null, reasons: ["Too few features"] }) }) });
    const out = await t.svc.run(S1);
    expect(out.status).toBe("INSUFFICIENT_DATA");
    expect(out.prediction).toBeUndefined();
    expect(t.saved).toHaveLength(1);
    expect(t.saved[0]).toMatchObject({ outcome: "INSUFFICIENT_DATA", prediction: null, modelStatus: MlModelStatus.EXPERIMENTAL });
    expect((await t.svc.run(S1)).status).toBe("INSUFFICIENT_DATA");
    expect(t.client.predictExperimental).toHaveBeenCalledTimes(1);
    expect(t.saved).toHaveLength(1);
  });
  it("a startup with no usable feature at all is insufficient without calling the model (marker stored)", async () => {
    const t = build({ features: {} });
    expect((await t.svc.run(S1)).status).toBe("INSUFFICIENT_DATA");
    expect(t.client.predictExperimental).not.toHaveBeenCalled();
    expect(t.saved[0]).toMatchObject({ outcome: "INSUFFICIENT_DATA", prediction: null });
  });
  it.each(["TIMEOUT", "NETWORK", "AUTH_FAILED", "SERVICE_ERROR", "MODEL_NOT_FOUND", "SCHEMA_MISMATCH", "NOT_EXPERIMENTAL", "BAD_RESPONSE"])("a %s failure is a controlled outcome: nothing stored, nothing thrown", async (reason) => {
    const t = build({ call: async () => ({ ok: false, reason }) });
    const out = await t.svc.run(S1);
    expect(out.status).toBe("FAILED");
    expect(out.detail).toBe(reason);
    expect(t.saved).toHaveLength(0);
  });
  it("even an unexpected exception (e.g. a stack trace) becomes FAILED and is never rethrown", async () => {
    const t = build({ call: async () => { throw new Error("boom\n    at secret.js:1:1"); } });
    const out = await t.svc.run(S1);
    expect(out).toMatchObject({ status: "FAILED", detail: "boom" });
    expect(JSON.stringify(out)).not.toMatch(/secret\.js/);
    await expect(t.svc.onFeaturesChanged(S1)).resolves.toBeUndefined();
  });
  it("the failure counter feeds the monitoring view without exposing detail beyond the reason", async () => {
    const t = build({ call: async () => ({ ok: false, reason: "TIMEOUT" }) });
    await t.svc.run(S1);
    const m = await t.svc.monitoring();
    expect(m.inferenceFailuresSinceStart).toBe(1);
    expect(JSON.stringify(m)).not.toMatch(/at .*\.(js|ts):\d+/);
    expect(Object.keys(m).filter((k) => /accuracy|auc|roc|f1|precision|recall|brier/i.test(k))).toEqual([]); // no fake accuracy metric
  });
  it("the client turns a timeout into a TIMEOUT reason instead of throwing", async () => {
    const client = new MlInferenceClient({ get: (k: string) => ({ ML_EXPERIMENTAL_INFERENCE_ENABLED: "true", ML_SCORING_SERVICE_URL: "http://127.0.0.1:1", ML_SERVICE_TOKEN: "t", ML_SCORING_TIMEOUT_MS: "20" } as Record<string, string>)[k] } as any);
    const original = global.fetch;
    global.fetch = ((_u: unknown, init: { signal: AbortSignal }) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as never;
    try {
      await expect(client.predictExperimental({ startupId: S1, featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, features: GOOD }, MODEL)).resolves.toEqual({ ok: false, reason: "TIMEOUT" });
    } finally { global.fetch = original; }
  });
  it("the client reports a 401/403 from the inference service as AUTH_FAILED, and the failure is counted by reason", async () => {
    const client = new MlInferenceClient({ get: (k: string) => ({ ML_EXPERIMENTAL_INFERENCE_ENABLED: "true", ML_SCORING_SERVICE_URL: "http://svc", ML_SERVICE_TOKEN: "secret-token-value" } as Record<string, string>)[k] } as any);
    const original = global.fetch;
    global.fetch = (async () => ({ ok: false, status: 401, json: async () => ({ detail: "Invalid or missing service token" }) })) as never;
    const warn = jest.spyOn((client as any).logger, "warn").mockImplementation(() => undefined);
    try {
      const req = { startupId: S1, featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, features: GOOD };
      await expect(client.predictExperimental(req, MODEL)).resolves.toEqual({ ok: false, reason: "AUTH_FAILED" });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-token-value");
    } finally { global.fetch = original; }
    const t = build({ call: async () => ({ ok: false, reason: "AUTH_FAILED" }) });
    await t.svc.run(S1);
    expect((await t.svc.monitoring()).failuresByReason).toEqual({ AUTH_FAILED: 1 });
  });
  it("the client maps 409 schema mismatch and 404 to safe reasons, and sends the bearer token", async () => {
    const client = new MlInferenceClient({ get: (k: string) => ({ ML_EXPERIMENTAL_INFERENCE_ENABLED: "true", ML_SCORING_SERVICE_URL: "http://svc", ML_SERVICE_TOKEN: "tok" } as Record<string, string>)[k] } as any);
    const original = global.fetch;
    const calls: any[] = [];
    const responses = [{ ok: false, status: 409, json: async () => ({ detail: "Feature schema mismatch" }) }, { ok: false, status: 404, json: async () => ({}) }];
    global.fetch = (async (url: string, init: any) => { calls.push({ url, init }); return responses.shift(); }) as never;
    try {
      const req = { startupId: S1, featureSchemaVersion: "OLD", features: GOOD };
      await expect(client.predictExperimental(req, MODEL)).resolves.toEqual({ ok: false, reason: "SCHEMA_MISMATCH" });
      await expect(client.predictExperimental(req, MODEL)).resolves.toEqual({ ok: false, reason: "MODEL_NOT_FOUND" });
      expect(calls[0].url).toBe("http://svc/predict/experimental");
      expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
    } finally { global.fetch = original; }
  });
  it("the client rejects a response that is not flagged EXPERIMENTAL", async () => {
    const client = new MlInferenceClient({ get: (k: string) => ({ ML_EXPERIMENTAL_INFERENCE_ENABLED: "true", ML_SCORING_SERVICE_URL: "http://svc", ML_SERVICE_TOKEN: "tok" } as Record<string, string>)[k] } as any);
    const original = global.fetch;
    global.fetch = (async () => ({ ok: true, status: 200, json: async () => okResult({ modelStatus: "ACTIVE" }) })) as never;
    try {
      await expect(client.predictExperimental({ startupId: S1, featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, features: GOOD }, MODEL)).resolves.toEqual({ ok: false, reason: "BAD_RESPONSE" });
    } finally { global.fetch = original; }
  });
});

describe("experimental inference — batch", () => {
  it("is sequential, skips insufficient, stores the rest and reports the distribution", async () => {
    const startups = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "d", name: "D" }];
    let n = 0;
    const answers = [
      { ok: true, result: okResult({ prediction: 0.1 }) },
      { ok: true, result: okResult({ status: "INSUFFICIENT_DATA", prediction: null, reliability: null }) },
      { ok: false, reason: "TIMEOUT" },
      { ok: true, result: okResult({ prediction: 1 }) },
    ];
    let inFlight = 0; let maxInFlight = 0;
    const t = build({ startups, call: async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await Promise.resolve(); inFlight--; return answers[n++]; } });
    const summary = await t.svc.batch();
    expect(maxInFlight).toBe(1);
    expect(summary).toMatchObject({ total: 4, calledModel: 4, predicted: 2, insufficientData: 1, failed: 1 });
    expect(summary.distribution["0-20%"]).toBe(1);
    expect(summary.distribution["80-100%"]).toBe(1);
    expect(summary.failures).toEqual([{ startupId: "c", name: "C", reason: "TIMEOUT" }]);
    expect(t.saved.filter((p) => p.outcome === "PREDICTED")).toHaveLength(2);
    expect(summary.notice).toMatch(/not calibrated/i);
  });
  it("does nothing while disabled", async () => {
    const t = build({ env: { ML_EXPERIMENTAL_INFERENCE_ENABLED: "false" } });
    const s = await t.svc.batch();
    expect(s).toMatchObject({ predicted: 0, calledModel: 0 });
    expect(t.client.predictExperimental).not.toHaveBeenCalled();
  });
});

describe("experimental inference — what the owner sees (Predictive Intelligence)", () => {
  it("an available estimate is rounded to the nearest 5%, labelled experimental, and flagged as not part of the RUWAD Score", async () => {
    const t = build({ call: async () => ({ ok: true, result: okResult({ prediction: 0.421 }) }) });
    await t.svc.run(S1);
    const [m] = (await t.svc.ownerView(S1)).models;
    expect(m).toMatchObject({ status: "AVAILABLE", estimatePercent: 40, title: "6-Month Funding Outlook", label: "Experimental funding likelihood estimate", experimental: true, includedInRuwadScore: false });
    expect(m.disclaimer).toMatch(/not used in your RUWAD Score/i);
  });
  it("exposes no model version, training counts, input features, hash, drivers or raw probability", async () => {
    const t = build();
    await t.svc.run(S1);
    const json = JSON.stringify(await t.svc.ownerView(S1));
    for (const secret of [MODEL, "inputFeatures", "inputHash", "trainingRows", "featureSchemaVersion", "datasetVersion", "0.31", "drivers", "fundingRounds"]) expect(json).not.toContain(secret);
  });
  it("insufficient data is stated plainly, with no number", async () => {
    const t = build({ call: async () => ({ ok: true, result: okResult({ status: "INSUFFICIENT_DATA", prediction: null, reliability: null }) }) });
    await t.svc.run(S1);
    const [m] = (await t.svc.ownerView(S1)).models;
    expect(m).toMatchObject({ status: "INSUFFICIENT_DATA", message: "Insufficient structured data for an experimental prediction." });
    expect(m.estimatePercent).toBeUndefined();
  });
  it("shows PROCESSING right after scoring, then UNAVAILABLE (never a number) once a failed run has had its chance", async () => {
    const t = build({ call: async () => ({ ok: false, reason: "TIMEOUT" }) });
    await t.svc.run(S1);
    expect((await t.svc.ownerView(S1, new Date())).models[0]).toMatchObject({ status: "PROCESSING" });
    const m = (await t.svc.ownerView(S1, new Date(Date.now() - 10 * 60_000))).models[0];
    expect(m.status).toBe("UNAVAILABLE");
    expect(m.estimatePercent).toBeUndefined();
  });
  it("shows no card at all while inference is off or the model is not usable (nothing fabricated)", async () => {
    expect((await build({ env: { ML_EXPERIMENTAL_INFERENCE_ENABLED: "false" } }).svc.ownerView(S1)).models).toEqual([]);
    expect((await build({ modelStatus: MlModelStatus.ACTIVE }).svc.ownerView(S1)).models).toEqual([]);
  });
  it("prediction history is preserved: a changed input adds a second row and the owner sees the latest", async () => {
    const t = build();
    await t.svc.run(S1);
    const first = t.saved[0];
    first.predictedAt = new Date(Date.now() - 60_000);
    const t2 = build({ existing: [first], features: { ...GOOD, fundingRounds: 3 }, call: async () => ({ ok: true, result: okResult({ prediction: 0.62 }) }) });
    await t2.svc.run(S1);
    expect(t2.stored).toHaveLength(2);
    expect((await t2.svc.ownerView(S1)).models[0].estimatePercent).toBe(60);
    expect(t2.stored.map((p: any) => p.prediction)).toEqual([0.31, 0.62]);
  });
  it("accepts the ML_EXPERIMENTAL_MODEL_VERSION name, and it takes precedence over the older one", () => {
    expect(build({ env: { EXPERIMENTAL_MODEL_VERSION: "", ML_EXPERIMENTAL_MODEL_VERSION: "exp-new" } }).svc.selectedVersion()).toBe("exp-new");
    expect(build({ env: { EXPERIMENTAL_MODEL_VERSION: "exp-old", ML_EXPERIMENTAL_MODEL_VERSION: "exp-new" } }).svc.selectedVersion()).toBe("exp-new");
  });
});

describe("experimental inference — pure helpers", () => {
  it("assembleInput drops the member-count teamSize but keeps a stored value or a positive headcount", () => {
    expect(assembleInput({ derived: { teamSize: 2, founderCount: 2 } }).features).toEqual({ founderCount: 2 });
    expect(assembleInput({ derived: { teamSize: 2 }, stored: { teamSize: 40 } }).features).toEqual({ teamSize: 40 });
    expect(assembleInput({ derived: { teamSize: 2 }, employees: 25 }).features).toEqual({ teamSize: 25 });
    expect(assembleInput({ employees: 0 }).features).toEqual({});
  });
  it("a stored teamSize that the platform derived (member count) is not trusted as a headcount; a reported one is", () => {
    expect(assembleInput({ stored: { teamSize: 2 }, storedProvenance: { teamSize: { source: "SYSTEM_DERIVED" } }, employees: 25 }).features).toEqual({ teamSize: 25 });
    expect(assembleInput({ stored: { teamSize: 2 }, storedProvenance: { teamSize: { source: "SYSTEM_DERIVED" } } }).features).toEqual({});
    expect(assembleInput({ stored: { teamSize: 30 }, storedProvenance: { teamSize: { source: "FOUNDER_SUBMITTED" } }, employees: 25 }).features).toEqual({ teamSize: 30 });
  });
  it("assembleInput never emits strings, negatives, NaN or unknown keys", () => {
    const r = assembleInput({ stored: { fundingRounds: -1, customerCount: NaN, regulatoryMilestone: "x", foo: 1 } as never });
    expect(r.features).toEqual({});
    expect(r.dropped).toEqual(expect.arrayContaining(["fundingRounds", "customerCount"]));
  });
  it("buckets cover 0..1 including both ends", () => {
    expect([0, 0.19, 0.2, 0.5, 0.79, 0.8, 1].map(bucketFor)).toEqual(["0-20%", "0-20%", "20-40%", "40-60%", "60-80%", "80-100%", "80-100%"]);
    expect(Object.keys(emptyDistribution())).toHaveLength(5);
  });
});

describe("experimental inference — access control and score isolation", () => {
  const guard = new RolesGuard(new Reflector());
  const ctx = (role: UserRole, handler: unknown): any => ({ getHandler: () => handler, getClass: () => ExperimentalMlController, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) });

  it("the controller is JWT + role guarded and admin-only", () => {
    expect((Reflect.getMetadata("__guards__", ExperimentalMlController) as { name: string }[]).map((g) => g.name)).toEqual(["JwtAuthGuard", "RolesGuard"]);
    expect((Reflect.getMetadata(ROLES_KEY, ExperimentalMlController) as UserRole[]).sort()).toEqual([UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN].sort());
    expect(Reflect.getMetadata("path", ExperimentalMlController)).toBe("ml-data/experimental");
  });
  it.each([UserRole.USER, UserRole.INVESTOR, UserRole.FOUNDER])("a %s is refused on every experimental route, including the batch", (role) => {
    for (const h of [ExperimentalMlController.prototype.batch, ExperimentalMlController.prototype.latest, ExperimentalMlController.prototype.run, ExperimentalMlController.prototype.monitoring, ExperimentalMlController.prototype.evaluate]) {
      expect(guard.canActivate(ctx(role, h))).toBe(false);
    }
  });
  it.each([UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN])("a %s is allowed", (role) => {
    expect(guard.canActivate(ctx(role, ExperimentalMlController.prototype.batch))).toBe(true);
  });
  it("the score weights are untouched: RULE_WEIGHT 1, ML_WEIGHT 0", () => {
    expect(RULE_WEIGHT).toBe(1);
    expect(ML_WEIGHT).toBe(0);
  });
  it("nothing under startups/ or the public score path reads ml_predictions or the experimental service", () => {
    const root = join(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.ts$/.test(name) && !/\.spec\.ts$/.test(name)) {
          const src = readFileSync(p, "utf8");
          const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // comments may mention the table
          if (/MlPrediction\b|MlExperimentalInferenceService|ml_predictions|ml-prediction\.entity/.test(code)) offenders.push(p.replace(root, ""));
        }
      }
    };
    walk(join(root, "startups"));
    walk(join(root, "common"));
    expect(offenders).toEqual([]);
  });
  it("ScoringService calls the experimental hook without awaiting, and never reads it back into the score", () => {
    const src = readFileSync(join(__dirname, "..", "scoring", "scoring.service.ts"), "utf8");
    expect(src).toMatch(/if \(this\.experimental\)\s*\{\s*void this\.experimental\.onFeaturesChanged\(/);
    expect(src).not.toMatch(/await this\.experimental/);
    expect(src).not.toMatch(/=\s*(await\s+)?this\.experimental/);
  });
});
