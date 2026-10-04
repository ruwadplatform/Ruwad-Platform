import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface MlPredictRequest {
  startupId: string;
  snapshotAt: string;
  featureSchemaVersion: string;
  features: Record<string, unknown>;
}

export interface MlPredictBatchItem {
  target: string;
  targetVersion: string;
  modelVersion: string;
  prediction: number;
  predictionType: "PROBABILITY" | "REGRESSION_VALUE";
  modelStatus: string;
  featureSchemaVersion: string;
}

export interface ExperimentalPredictRequest {
  startupId: string;
  featureSchemaVersion: string;
  features: Record<string, unknown>;
}

/** What /predict/experimental answers (see ml/app/inference/experimental.py). */
export interface ExperimentalPredictResult {
  status: "OK" | "INSUFFICIENT_DATA";
  modelVersion: string;
  target: string;
  targetVersion: string;
  featureSchemaVersion: string;
  modelStatus: "EXPERIMENTAL";
  prediction: number | null;
  predictionType: "PROBABILITY";
  reliability: "VERY_LOW" | "LOW" | null;
  reliabilityReasons: string[];
  featureCompleteness: number;
  populatedFeatures: string[];
  missingFeatures: string[];
  outOfRange: string[];
  invalidFeatures: string[];
  reasons: string[];
  trainingRows: number;
  trainingPositives: number | null;
  trainingNegatives: number | null;
  algorithm: string;
  datasetVersion: string | null;
  calibration: string;
  drivers: { feature: string; contribution: number; direction: "UP" | "DOWN" }[];
  driversNote: string | null;
  warnings: string[];
}

/** Never throws: either the service's answer, or a short, safe failure reason (no stack traces, no response bodies). */
export type ExperimentalCallOutcome = { ok: true; result: ExperimentalPredictResult } | { ok: false; reason: "DISABLED" | "TIMEOUT" | "NETWORK" | "AUTH_FAILED" | "SERVICE_ERROR" | "MODEL_NOT_FOUND" | "SCHEMA_MISMATCH" | "NOT_EXPERIMENTAL" | "BAD_RESPONSE" };

/** Thin backend-only client for the Python ML inference service — mirrors
 * SerperClient's shape exactly (config-driven enabled flag, AbortController
 * timeout, provider errors never rethrown/echoed, only a short generic
 * warning logged). `ML_SCORING_ENABLED` must be exactly the string "true";
 * anything else (unset, "false", a typo) keeps this disabled — the same
 * fail-closed default every other optional integration in this codebase
 * uses. */
@Injectable()
export class MlInferenceClient {
  private readonly logger = new Logger(MlInferenceClient.name);
  readonly enabled: boolean;
  /** Separate switch for LIVE EXPERIMENTAL inference (ML_EXPERIMENTAL_INFERENCE_ENABLED must be exactly "true"). It does not depend on, and never turns on, ML_SCORING_ENABLED (shadow/score seam). */
  readonly experimentalEnabled: boolean;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>("ML_SCORING_SERVICE_URL") ?? "").replace(/\/+$/, "");
    this.token = (config.get<string>("ML_SERVICE_TOKEN") ?? "").trim();
    this.timeoutMs = Number(config.get<string>("ML_SCORING_TIMEOUT_MS") ?? "3000") || 3000;
    this.enabled = config.get<string>("ML_SCORING_ENABLED") === "true" && !!this.baseUrl;
    this.experimentalEnabled = config.get<string>("ML_EXPERIMENTAL_INFERENCE_ENABLED") === "true" && !!this.baseUrl && !!this.token;
    if (!this.enabled) {
      this.logger.log('ML scoring service disabled (ML_SCORING_ENABLED is not "true", or ML_SCORING_SERVICE_URL is unset) — shadow predictions are inert.');
    }
  }

  /** One feature vector against several model versions in a single call —
   * matches the real shadow-prediction use case (one new snapshot, every
   * currently SHADOW/ACTIVE model). Returns `[]` on ANY failure (disabled,
   * timeout, network error, non-2xx, malformed body) — never throws.
   * Matches DisabledMlProvider's own "must be equally safe to fail"
   * contract, so a Python outage can never break scoring. */
  async predictBatch(request: MlPredictRequest, modelVersions: string[]): Promise<MlPredictBatchItem[]> {
    if (!this.enabled || !modelVersions.length) return [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/predict/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ ...request, modelVersions }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        this.logger.warn(`ML predict/batch failed (HTTP ${res.status})`);
        return [];
      }
      const body = await res.json();
      return Array.isArray(body?.predictions) ? body.predictions : [];
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") this.logger.warn("ML predict/batch request timed out");
      else this.logger.warn(`ML predict/batch request failed: ${e instanceof Error ? e.message : "unknown error"}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** One startup, one explicitly named EXPERIMENTAL model, via the service's /predict/experimental. Short timeout; any failure becomes a
   * safe reason code so RUWĀD scoring is never affected. */
  async predictExperimental(request: ExperimentalPredictRequest, modelVersion: string): Promise<ExperimentalCallOutcome> {
    if (!this.experimentalEnabled) return { ok: false, reason: "DISABLED" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/predict/experimental`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ ...request, modelVersion }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        this.logger.warn(`ML predict/experimental failed (HTTP ${res.status})`);
        // 401/403: the shared service token is wrong or missing on one side. Reported as its own reason so it is not mistaken for an outage.
        if (res.status === 401 || res.status === 403) {
          this.logger.warn("ML predict/experimental was rejected by the inference service (authentication): check that ML_SERVICE_TOKEN matches on both services");
          return { ok: false, reason: "AUTH_FAILED" };
        }
        return { ok: false, reason: res.status === 404 ? "MODEL_NOT_FOUND" : res.status === 409 ? (await this.conflictReason(res)) : "SERVICE_ERROR" };
      }
      const body = (await res.json()) as ExperimentalPredictResult;
      if (!body || (body.status !== "OK" && body.status !== "INSUFFICIENT_DATA") || body.modelStatus !== "EXPERIMENTAL") return { ok: false, reason: "BAD_RESPONSE" };
      return { ok: true, result: body };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") { this.logger.warn("ML predict/experimental request timed out"); return { ok: false, reason: "TIMEOUT" }; }
      this.logger.warn(`ML predict/experimental request failed: ${e instanceof Error ? e.message : "unknown error"}`);
      return { ok: false, reason: "NETWORK" };
    } finally {
      clearTimeout(timer);
    }
  }

  private async conflictReason(res: Response): Promise<"SCHEMA_MISMATCH" | "NOT_EXPERIMENTAL" | "SERVICE_ERROR"> {
    try {
      const detail = String(((await res.json()) as { detail?: unknown })?.detail ?? "");
      if (/schema/i.test(detail)) return "SCHEMA_MISMATCH";
      if (/EXPERIMENTAL/.test(detail)) return "NOT_EXPERIMENTAL";
    } catch { /* fall through */ }
    return "SERVICE_ERROR";
  }

  /** Single-target convenience wrapper — used only by HttpMlScoringProvider's
   * legacy-shape compatibility method (see scoring/ml/http-ml-scoring-
   * provider.ts). The real shadow-prediction path always uses
   * predictBatch() directly. */
  async predictSingle(request: MlPredictRequest, modelVersion: string): Promise<MlPredictBatchItem | null> {
    const [first] = await this.predictBatch(request, [modelVersion]);
    return first ?? null;
  }
}
