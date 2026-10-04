import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MlPrediction, ScoringFeatures } from "../scoring.types";
import type { MlScoringProvider } from "./ml-scoring-provider.interface";
import { clampScore, clampConfidence } from "../scoring.utils";
import { MlInferenceClient } from "../../ml-data/ml-inference-client";
import { ML_FEATURE_SCHEMA_VERSION } from "../../ml-data/ml-data.constants";

/** Real MlScoringProvider implementation, registered but bound in place of
 * DisabledMlProvider only when `ML_SCORING_ENABLED=true` (see
 * scoring.module.ts's factory provider) — the default stays disabled.
 *
 * Important: this is a compatibility shim for the OLD single-composite-
 * score interface this codebase already had (see MlPrediction's own
 * `{score, confidence}` shape), not the real Phase 2A shadow-prediction
 * mechanism — that's MlShadowPredictionService, which stores per-target
 * predictions in ml_predictions and never touches a startup's score at
 * all. Even when this class IS bound, its return value is mathematically
 * inert on the public RUWĀD Score, because ScoringService blends it as
 * `RULE_WEIGHT * ruleScore + ML_WEIGHT * ml.score` with ML_WEIGHT fixed at
 * 0 (scoring.constants.ts) — this class exists only so a real
 * implementation exists behind the interface the ML seam was designed
 * around, not because it's expected to do anything yet. */
@Injectable()
export class HttpMlScoringProvider implements MlScoringProvider {
  private readonly logger = new Logger(HttpMlScoringProvider.name);
  private readonly primaryModelVersion: string;

  constructor(private readonly client: MlInferenceClient, config: ConfigService) {
    this.primaryModelVersion = (config.get<string>("ML_PRIMARY_MODEL_VERSION") ?? "").trim();
  }

  async predict(features: ScoringFeatures): Promise<MlPrediction | null> {
    if (!this.client.enabled || !this.primaryModelVersion) return null;
    try {
      const result = await this.client.predictSingle(
        { startupId: "unscored", snapshotAt: new Date().toISOString(), featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, features: features as unknown as Record<string, unknown> },
        this.primaryModelVersion,
      );
      if (!result || result.predictionType !== "PROBABILITY") return null;
      return { score: clampScore(result.prediction * 10), confidence: clampConfidence(0.5) };
    } catch (e) {
      this.logger.warn(`HttpMlScoringProvider.predict failed, returning null: ${e instanceof Error ? e.message : "unknown error"}`);
      return null;
    }
  }
}
