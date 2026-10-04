import { Injectable } from "@nestjs/common";
import { ScoreStatus } from "../common/enums";
import { FACTOR_KEYS, FactorKey } from "./scoring.types";
import { ScoringService } from "./scoring.service";
import { MlExperimentalInferenceService, PredictiveIntelligence } from "../ml-data/ml-experimental-inference.service";

export const FACTOR_LABELS: Record<FactorKey, string> = {
  growth: "Growth Momentum",
  financial: "Financial Strength",
  market: "Market Potential",
  team: "Team Strength",
  regulatory: "Regulatory Readiness",
  technology: "Technology Differentiation",
};

export const PENDING_MESSAGE = "Add more company information to complete your RUWĀD assessment.";

export type AssessmentScoreState = "READY" | "PENDING" | "PROCESSING";

export interface StartupAssessment {
  startupId: string;
  /** The official RUWĀD Score. Always produced by the deterministic scoring engines; ML never feeds it. `value` is null (never 0) when there is not enough data. */
  ruwadScore: { state: AssessmentScoreState; value: number | null; outOf: 10; dataConfidence: number | null; version: string; calculatedAt: string; message?: string };
  factors: { key: FactorKey; label: string; score: number | null; confidence: number; explanation: string; missingInputs: string[] }[];
  /** Separate from the score on purpose. Only models that actually exist are listed. */
  predictiveIntelligence: PredictiveIntelligence;
  /** True while either the score or an experimental prediction is still being produced: the page should keep polling briefly. */
  processing: boolean;
}

/** The owner-facing assessment: the official score and its six factors, plus the separate experimental "Predictive Intelligence" card.
 *
 *  Read-only and server-built — the frontend never computes a score or a prediction. It reads stored rows only, so opening the page can
 *  neither trigger scoring nor call the ML service; a slow or dead ML service cannot affect it. Provenance internals, raw ML features,
 *  model metadata and admin notes are deliberately absent. */
@Injectable()
export class StartupAssessmentService {
  constructor(private readonly scoring: ScoringService, private readonly experimental: MlExperimentalInferenceService) {}

  async get(startupId: string): Promise<StartupAssessment> {
    const score = await this.scoring.getScoreForStartup(startupId);
    const calculated = score.status === ScoreStatus.CALCULATED && score.ruwadScore != null;
    const neverRun = score.status === ScoreStatus.NOT_CALCULATED;
    const state: AssessmentScoreState = calculated ? "READY" : neverRun ? "PROCESSING" : "PENDING";

    const predictiveIntelligence = await this.experimental.ownerView(startupId, neverRun ? null : score.calculatedAt).catch(() => ({ models: [] } as PredictiveIntelligence));

    return {
      startupId,
      ruwadScore: {
        state,
        value: calculated ? score.ruwadScore : null,
        outOf: 10,
        dataConfidence: calculated ? score.confidenceScore : null,
        version: score.version,
        calculatedAt: score.calculatedAt,
        message: state === "PENDING" ? PENDING_MESSAGE : state === "PROCESSING" ? "Processing your RUWĀD assessment…" : undefined,
      },
      factors: FACTOR_KEYS.map((key) => {
        const f = score.factors[key];
        return { key, label: FACTOR_LABELS[key], score: f.score, confidence: f.confidence, explanation: f.reason, missingInputs: [...f.missingInputs] };
      }),
      predictiveIntelligence,
      processing: neverRun || predictiveIntelligence.models.some((m) => m.status === "PROCESSING"),
    };
  }
}
