import { Injectable } from "@nestjs/common";
import type { MlPrediction, ScoringFeatures } from "../scoring.types";
import type { MlScoringProvider } from "./ml-scoring-provider.interface";

/** The only MlScoringProvider registered while ML_SCORING_ENABLED is unset
 * (the default, and the only supported state today — see ScoringModule).
 * Always returns null, so ScoringService's deterministic path runs
 * unmodified. A future real provider (calling ML_SCORING_SERVICE_URL) must
 * be equally safe to fail: on any error, return null rather than throw,
 * exactly like resume-parse.service.ts/submission-autofill.service.ts
 * already do for a missing Anthropic key. */
@Injectable()
export class DisabledMlProvider implements MlScoringProvider {
  async predict(_features: ScoringFeatures): Promise<MlPrediction | null> {
    return null;
  }
}
