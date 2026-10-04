import { api } from "./client";

// EXPERIMENTAL live ML estimate — admin-only, and never part of the RUWAD Score.

export interface ExperimentalPrediction {
  id: string; startupId: string; targetName: string; targetVersion: string; modelVersion: string;
  /** 0..1 raw model output. Uncalibrated: shown as a rough band, never as a precise forecast. */
  prediction: number; predictedAt: string; modelStatus: "EXPERIMENTAL";
  featureSchemaVersion: string | null; featureCompleteness: number | null; reliability: "VERY_LOW" | "LOW" | null;
}
export interface ExperimentalModelSummary {
  modelVersion: string; algorithm: string; status: string; trainingRows: number; targetName: string; targetVersion: string;
  trainedAt: string | null; datasetVersion: string | null; positiveCount: number | null; negativeCount: number | null;
}
export interface ExperimentalStartupView {
  enabled: boolean; modelVersion: string | null; model: ExperimentalModelSummary | null; modelProblem: string | null;
  prediction: ExperimentalPrediction | null; history: ExperimentalPrediction[];
  /** NONE = never run; INSUFFICIENT_DATA = the model declined for the current inputs. */
  currentStatus: "NONE" | "PREDICTED" | "INSUFFICIENT_DATA";
}
export type ExperimentalRunStatus = "DISABLED" | "MODEL_UNAVAILABLE" | "INSUFFICIENT_DATA" | "UNCHANGED" | "PREDICTED" | "FAILED";
export interface ExperimentalRunOutcome { status: ExperimentalRunStatus; startupId: string; prediction?: ExperimentalPrediction; reasons?: string[]; detail?: string }
export interface ExperimentalBatchSummary {
  total: number; skippedNoFeatures: number; calledModel: number; predicted: number; unchanged: number; insufficientData: number; failed: number;
  distribution: Record<string, number>; failures: { startupId: string; name: string; reason: string }[]; notice: string;
}
export interface ExperimentalMonitoring {
  enabled: boolean; selectedModelVersion: string | null; modelStatus: string | null; modelProblem: string | null;
  predictionsStored: number; startupsWithPrediction: number; distribution: Record<string, number>; averageFeatureCompleteness: number | null;
  startupsInsufficientData: number; inferenceFailuresSinceStart: number; recentFailures: { at: string; startupId: string; reason: string }[]; evaluated: number; note: string;
}

export const fetchExperimentalMonitoring = () => api.get<ExperimentalMonitoring>("/ml-data/experimental/monitoring");
export const fetchExperimentalForStartup = (startupId: string) => api.get<ExperimentalStartupView>(`/ml-data/experimental/startups/${startupId}`);
export const runExperimentalForStartup = (startupId: string) => api.post<ExperimentalRunOutcome>(`/ml-data/experimental/startups/${startupId}/run`);
export const runExperimentalBatch = () => api.post<ExperimentalBatchSummary>("/ml-data/experimental/batch");
export const evaluateExperimentalPredictions = () => api.post<{ evaluated: number; stillOpen: number }>("/ml-data/experimental/evaluate");
