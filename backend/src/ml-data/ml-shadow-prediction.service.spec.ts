import { MlModelStatus } from "../common/enums";
import { MlShadowPredictionService } from "./ml-shadow-prediction.service";
import type { Startup } from "../startups/startup.entity";
import type { StartupMlFeatureSnapshot } from "./startup-ml-feature-snapshot.entity";

function fakeClient(enabled: boolean, predictBatch: jest.Mock = jest.fn(async () => [])) {
  return { enabled, predictBatch } as any;
}
function fakeRegistry(models: any[] = []) {
  return { findEligibleForShadowPrediction: jest.fn(async () => models) } as any;
}
function fakePredictionsRepo() {
  const saved: any[] = [];
  return { saved, create: jest.fn((x: any) => x), save: jest.fn(async (rows: any) => { saved.push(...(Array.isArray(rows) ? rows : [rows])); return rows; }), find: jest.fn(async () => []) };
}

const startup = { id: "startup-1", ruwadScore: 7.2, stage: "Seed" } as unknown as Startup;
const snapshot = { id: "snap-1", snapshotAt: new Date("2026-01-01T00:00:00Z"), featureSchemaVersion: "ML-FEATURES-1.0", features: { annualRevenue: 100000 } } as unknown as StartupMlFeatureSnapshot;

describe("MlShadowPredictionService.generateShadowPredictions", () => {
  it("makes no calls at all when the client is disabled", async () => {
    const client = fakeClient(false);
    const registry = fakeRegistry();
    const predictions = fakePredictionsRepo();
    const svc = new MlShadowPredictionService(client, registry, predictions as any, {} as any, {} as any, { find: async () => [] } as any);

    await svc.generateShadowPredictions(startup, snapshot);

    expect(registry.findEligibleForShadowPrediction).not.toHaveBeenCalled();
    expect(client.predictBatch).not.toHaveBeenCalled();
    expect(predictions.saved).toHaveLength(0);
  });

  it("does not call the Python service when no model is eligible for shadow prediction", async () => {
    const client = fakeClient(true);
    const registry = fakeRegistry([]);
    const predictions = fakePredictionsRepo();
    const svc = new MlShadowPredictionService(client, registry, predictions as any, {} as any, {} as any, { find: async () => [] } as any);

    await svc.generateShadowPredictions(startup, snapshot);

    expect(client.predictBatch).not.toHaveBeenCalled();
    expect(predictions.saved).toHaveLength(0);
  });

  it("stores each prediction using the model's status from the registry, never from Python's response", async () => {
    const models = [{ modelVersion: "v-shadow", status: MlModelStatus.SHADOW }, { modelVersion: "v-active", status: MlModelStatus.ACTIVE }];
    const client = fakeClient(true, jest.fn(async () => [
      { target: "raisedNewRoundWithin12Months", targetVersion: "v1", modelVersion: "v-shadow", prediction: 0.73, predictionType: "PROBABILITY", modelStatus: "SOME_UNTRUSTED_VALUE_FROM_PYTHON", featureSchemaVersion: "ML-FEATURES-1.0" },
      { target: "raisedNewRoundWithin12Months", targetVersion: "v1", modelVersion: "v-active", prediction: 0.61, predictionType: "PROBABILITY", modelStatus: "SOME_UNTRUSTED_VALUE_FROM_PYTHON", featureSchemaVersion: "ML-FEATURES-1.0" },
    ]));
    const registry = fakeRegistry(models);
    const predictions = fakePredictionsRepo();
    const svc = new MlShadowPredictionService(client, registry, predictions as any, {} as any, {} as any, { find: async () => [] } as any);

    await svc.generateShadowPredictions(startup, snapshot);

    expect(client.predictBatch).toHaveBeenCalledWith(expect.objectContaining({ startupId: "startup-1" }), ["v-shadow", "v-active"]);
    expect(predictions.saved).toHaveLength(2);
    expect(predictions.saved.find((r: any) => r.modelVersion === "v-shadow").modelStatus).toBe(MlModelStatus.SHADOW);
    expect(predictions.saved.find((r: any) => r.modelVersion === "v-active").modelStatus).toBe(MlModelStatus.ACTIVE);
  });

  it("drops a prediction for a model version the registry no longer considers eligible (e.g. retired mid-flight)", async () => {
    const models = [{ modelVersion: "v-shadow", status: MlModelStatus.SHADOW }];
    const client = fakeClient(true, jest.fn(async () => [
      { target: "raisedNewRoundWithin12Months", targetVersion: "v1", modelVersion: "v-stale", prediction: 0.5, predictionType: "PROBABILITY", modelStatus: "ACTIVE", featureSchemaVersion: "ML-FEATURES-1.0" },
    ]));
    const registry = fakeRegistry(models);
    const predictions = fakePredictionsRepo();
    const svc = new MlShadowPredictionService(client, registry, predictions as any, {} as any, {} as any, { find: async () => [] } as any);

    await svc.generateShadowPredictions(startup, snapshot);

    expect(predictions.saved).toHaveLength(0);
  });

  it("is best-effort: a thrown error from the Python client never propagates", async () => {
    const client = fakeClient(true, jest.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const registry = fakeRegistry([{ modelVersion: "v-shadow", status: MlModelStatus.SHADOW }]);
    const predictions = fakePredictionsRepo();
    const svc = new MlShadowPredictionService(client, registry, predictions as any, {} as any, {} as any, { find: async () => [] } as any);

    await expect(svc.generateShadowPredictions(startup, snapshot)).resolves.toBeUndefined();
    expect(predictions.saved).toHaveLength(0);
  });

  it("never mutates the startup object passed in — no write path to ruwadScore", async () => {
    const client = fakeClient(true, jest.fn(async () => [{ target: "raisedNewRoundWithin12Months", targetVersion: "v1", modelVersion: "v-shadow", prediction: 0.9, predictionType: "PROBABILITY", modelStatus: "SHADOW", featureSchemaVersion: "ML-FEATURES-1.0" }]));
    const registry = fakeRegistry([{ modelVersion: "v-shadow", status: MlModelStatus.SHADOW }]);
    const predictions = fakePredictionsRepo();
    const svc = new MlShadowPredictionService(client, registry, predictions as any, {} as any, {} as any, { find: async () => [] } as any);
    const startupSnapshotBefore = { ...startup };

    await svc.generateShadowPredictions(startup, snapshot);

    expect(startup).toEqual(startupSnapshotBefore);
  });
});

describe("MlShadowPredictionService.evaluateMaturedPredictions", () => {
  it("returns zero counts when there are no unevaluated predictions", async () => {
    const predictions = { find: jest.fn(async () => []), save: jest.fn() } as any;
    const svc = new MlShadowPredictionService(fakeClient(false), fakeRegistry(), predictions, {} as any, {} as any, { find: async () => [] } as any);

    const result = await svc.evaluateMaturedPredictions(new Date());

    expect(result).toEqual({ evaluated: 0, stillImmature: 0 });
    expect(predictions.save).not.toHaveBeenCalled();
  });

  it("skips a prediction whose targetName is not a known target, without throwing", async () => {
    const unevaluated = [{ id: "p1", targetName: "notARealTarget", snapshotId: "snap-1", startupId: "startup-1", evaluatedAt: null }];
    const predictions = { find: jest.fn(async () => unevaluated), save: jest.fn() } as any;
    const svc = new MlShadowPredictionService(fakeClient(false), fakeRegistry(), predictions, {} as any, {} as any, { find: async () => [] } as any);

    const result = await svc.evaluateMaturedPredictions(new Date());

    expect(result).toEqual({ evaluated: 0, stillImmature: 0 });
    expect(predictions.save).not.toHaveBeenCalled();
  });

  it("skips a prediction whose snapshot no longer exists", async () => {
    const unevaluated = [{ id: "p1", targetName: "raisedNewRoundWithin12Months", snapshotId: "missing-snapshot", startupId: "startup-1", evaluatedAt: null }];
    const predictions = { find: jest.fn(async () => unevaluated), save: jest.fn() } as any;
    const snapshots = { findOne: jest.fn(async () => null) } as any;
    const svc = new MlShadowPredictionService(fakeClient(false), fakeRegistry(), predictions, snapshots, {} as any, { find: async () => [] } as any);

    const result = await svc.evaluateMaturedPredictions(new Date());

    expect(result).toEqual({ evaluated: 0, stillImmature: 0 });
    expect(predictions.save).not.toHaveBeenCalled();
  });
});
