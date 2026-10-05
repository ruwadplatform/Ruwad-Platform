import { api } from "./client";

/** The founder's own assessment, exactly as the backend built it. Nothing here is calculated in the browser: the RUWĀD Score and the
 * experimental prediction both come from backend-controlled services. */

export type AssessmentScoreState = "READY" | "PENDING" | "PROCESSING";
export type PredictiveStatus = "AVAILABLE" | "INSUFFICIENT_DATA" | "PROCESSING" | "UNAVAILABLE";

/** A form field the founder can fill in, and the wizard step it lives on. */
export interface MissingField { key: string; label: string; where: string }

export interface AssessmentFactor {
  key: "growth" | "financial" | "market" | "team" | "regulatory" | "technology";
  label: string;
  /** UNAVAILABLE = this factor cannot be calculated from the information provided (shown as such, never as a number). */
  status: "AVAILABLE" | "UNAVAILABLE";
  score: number | null;
  /** 0..1: the share of this factor's inputs that were provided. */
  confidence: number;
  explanation: string;
  missingFields: MissingField[];
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

export interface AssessmentCompletion {
  factorsAvailable: number;
  factorsRequired: number;
  meanConfidence: number | null;
  confidenceRequired: number;
  blockers: string[];
  unavailableFactors: { key: AssessmentFactor["key"]; label: string; missingFields: MissingField[] }[];
}

export interface StartupAssessment {
  startupId: string;
  ruwadScore: { state: AssessmentScoreState; value: number | null; outOf: 10; dataConfidence: number | null; version: string; calculatedAt: string; message?: string };
  /** Only while the score is PENDING: exactly why, and what to add. */
  completion?: AssessmentCompletion;
  factors: AssessmentFactor[];
  predictiveIntelligence: { models: PredictiveModelCard[] };
  processing: boolean;
}

export const fetchStartupAssessment = (startupId: string) => api.get<StartupAssessment>(`/startups/${startupId}/assessment`);
