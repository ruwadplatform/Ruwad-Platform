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
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>("ML_SCORING_SERVICE_URL") ?? "").replace(/\/+$/, "");
    this.token = (config.get<string>("ML_SERVICE_TOKEN") ?? "").trim();
    this.timeoutMs = Number(config.get<string>("ML_SCORING_TIMEOUT_MS") ?? "3000") || 3000;
    this.enabled = config.get<string>("ML_SCORING_ENABLED") === "true" && !!this.baseUrl;
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

  /** Single-target convenience wrapper — used only by HttpMlScoringProvider's
   * legacy-shape compatibility method (see scoring/ml/http-ml-scoring-
   * provider.ts). The real shadow-prediction path always uses
   * predictBatch() directly. */
  async predictSingle(request: MlPredictRequest, modelVersion: string): Promise<MlPredictBatchItem | null> {
    const [first] = await this.predictBatch(request, [modelVersion]);
    return first ?? null;
  }
}
