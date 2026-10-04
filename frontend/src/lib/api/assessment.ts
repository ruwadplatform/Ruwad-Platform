import { api } from "./client";

/** The founder's own assessment, exactly as the backend built it. Nothing here is calculated in the browser: the RUWĀD Score and the
 * experimental prediction both come from backend-controlled services. */

export type AssessmentScoreState = "READY" | "PENDING" | "PROCESSING";
export type PredictiveStatus = "AVAILABLE" | "INSUFFICIENT_DATA" | "PROCESSING" | "UNAVAILABLE";

export interface AssessmentFactor {
  key: "growth" | "financial" | "market" | "team" | "regulatory" | "technology";
  label: string;
  /** null = not enough data for this factor yet (shown as "Pending", never 0). */
  score: number | null;
  confidence: number;
  explanation: string;
  missingInputs: string[];
}

export interface PredictiveModelCard {
  target: string;
  title: string;
  label: string;
  experimental: true;
  includedInRuwadScore: false;
  disclaimer: string;
  status: PredictiveStatus;
  /** Rounded to the nearest 5%: the model is uncalibrated, so a finer figure would overstate its accuracy. */
  estimatePercent?: number;
  band?: string;
  reliability?: "VERY_LOW" | "LOW";
  predictedAt?: string;
  message?: string;
}

export interface StartupAssessment {
  startupId: string;
  ruwadScore: { state: AssessmentScoreState; value: number | null; outOf: 10; dataConfidence: number | null; version: string; calculatedAt: string; message?: string };
  factors: AssessmentFactor[];
  predictiveIntelligence: { models: PredictiveModelCard[] };
  processing: boolean;
}

export const fetchStartupAssessment = (startupId: string) => api.get<StartupAssessment>(`/startups/${startupId}/assessment`);
