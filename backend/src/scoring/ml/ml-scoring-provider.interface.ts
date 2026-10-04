import type { MlPrediction, ScoringFeatures } from "../scoring.types";

/** Future integration point for a trained model (CatBoost/XGBoost/LightGBM,
 * likely served by a separate Python microservice — see the module's own
 * README-style comment in ml-scoring.module.ts). The deterministic engines
 * in ../engines must work perfectly with every implementation of this
 * returning null; nothing in the scoring service may assume an ML
 * prediction exists. */
export interface MlScoringProvider {
  predict(features: ScoringFeatures): Promise<MlPrediction | null>;
}

export const ML_SCORING_PROVIDER = "ML_SCORING_PROVIDER";
