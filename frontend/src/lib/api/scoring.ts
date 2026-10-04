import { api } from "./client";
import type { ScoreFactors, ScoreStatus } from "@/types/entities";

export type ScoreDataSource = "FOUNDER_SUBMITTED" | "ADMIN_ENTERED" | "PITCH_DECK_EXTRACTED" | "VERIFIED_DOCUMENT" | "EXTERNAL_SOURCE" | "SYSTEM_DERIVED";

export interface FeatureProvenanceEntry {
  source: ScoreDataSource;
  verified: boolean;
  sourceDocumentId?: string;
  extractedAt?: string;
}

/** Admin-only view of one startup's score — the richer sibling of the
 * public detail payload (see StartupsService.toDetail()): every factor's
 * `reason`/`inputsUsed`/`missingInputs` are included here, never on the
 * public route. */
export interface AdminScoreResult {
  status: ScoreStatus;
  ruwadScore: number | null;
  confidenceScore: number | null;
  version: string;
  calculatedAt: string;
  factors: Record<keyof ScoreFactors, { score: number | null; confidence: number; reason: string; inputsUsed: string[]; missingInputs: string[] }>;
  missingFactors: string[];
}

export interface AdminScoreHistoryRow {
  id: string;
  status: ScoreStatus;
  ruwadScore: number | null;
  confidenceScore: number | null;
  version: string;
  triggeredBy: string;
  calculatedAt: string;
}

export interface AdminScoringFeatures {
  startupId: string;
  features: Record<string, unknown>;
  provenance: Record<string, FeatureProvenanceEntry>;
}

export interface BackfillRow {
  startupId: string;
  name: string;
  status: ScoreStatus;
  error?: string;
}

export const fetchAdminScore = (startupId: string) => api.get<AdminScoreResult>(`/scoring/startups/${startupId}`);
export const fetchAdminScoreHistory = (startupId: string) => api.get<AdminScoreHistoryRow[]>(`/scoring/startups/${startupId}/history`);
export const fetchAdminScoringFeatures = (startupId: string) => api.get<AdminScoringFeatures>(`/scoring/startups/${startupId}/features`);

export const setAdminScoringFeatures = (startupId: string, features: Record<string, unknown>, source: ScoreDataSource, reason: string) =>
  api.put<AdminScoringFeatures>(`/scoring/startups/${startupId}/features`, { features, source, reason });

export const verifyAdminScoringFeatures = (startupId: string, keys: string[]) =>
  api.post<AdminScoringFeatures>(`/scoring/startups/${startupId}/features/verify`, { keys });

export const recalculateAdminScore = (startupId: string) => api.post<AdminScoreResult>(`/scoring/startups/${startupId}/recalculate`);

/* ---- Admin only, platform-wide — the backend enforces the role; this just calls it ---- */
export const runScoringBackfill = () => api.post<BackfillRow[]>("/scoring/admin/backfill");
