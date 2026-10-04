import { HttpMlScoringProvider } from "./http-ml-scoring-provider";
import type { ScoringFeatures } from "../scoring.types";

function fakeConfig(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as any;
}
function fakeClient(enabled: boolean, predictSingle: jest.Mock = jest.fn(async () => null)) {
  return { enabled, predictSingle } as any;
}

const features = {} as ScoringFeatures;

describe("HttpMlScoringProvider — inert compatibility shim, safe-fail", () => {
  it("returns null immediately when the underlying client is disabled, without calling it", async () => {
    const client = fakeClient(false);
    const provider = new HttpMlScoringProvider(client, fakeConfig({ ML_PRIMARY_MODEL_VERSION: "some-model" }));

    const result = await provider.predict(features);

    expect(result).toBeNull();
    expect(client.predictSingle).not.toHaveBeenCalled();
  });

  it("returns null when no primary model version is configured, even if the client is enabled", async () => {
    const client = fakeClient(true);
    const provider = new HttpMlScoringProvider(client, fakeConfig({}));

    const result = await provider.predict(features);

    expect(result).toBeNull();
    expect(client.predictSingle).not.toHaveBeenCalled();
  });

  it("returns null when the Python service has no result for the model", async () => {
    const client = fakeClient(true, jest.fn(async () => null));
    const provider = new HttpMlScoringProvider(client, fakeConfig({ ML_PRIMARY_MODEL_VERSION: "some-model" }));

    expect(await provider.predict(features)).toBeNull();
  });

  it("returns null for a REGRESSION_VALUE prediction — the old {score,confidence} shape only makes sense for a probability", async () => {
    const client = fakeClient(true, jest.fn(async () => ({ prediction: 42, predictionType: "REGRESSION_VALUE" })));
    const provider = new HttpMlScoringProvider(client, fakeConfig({ ML_PRIMARY_MODEL_VERSION: "some-model" }));

    expect(await provider.predict(features)).toBeNull();
  });

  it("maps a valid PROBABILITY prediction into the legacy {score, confidence} shape, scaled to 0-10", async () => {
    const client = fakeClient(true, jest.fn(async () => ({ prediction: 0.8, predictionType: "PROBABILITY" })));
    const provider = new HttpMlScoringProvider(client, fakeConfig({ ML_PRIMARY_MODEL_VERSION: "some-model" }));

    const result = await provider.predict(features);

    expect(result).not.toBeNull();
    expect(result!.score).toBeCloseTo(8, 5);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it("safe-fails to null when the client throws, never propagating the error", async () => {
    const client = fakeClient(true, jest.fn(async () => { throw new Error("network error"); }));
    const provider = new HttpMlScoringProvider(client, fakeConfig({ ML_PRIMARY_MODEL_VERSION: "some-model" }));

    await expect(provider.predict(features)).resolves.toBeNull();
  });
});
