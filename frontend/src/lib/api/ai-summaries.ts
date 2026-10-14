import { api } from "./client";

export type AiSummaryEntityType = "startups" | "investors" | "hubs" | "multinationals";

export interface AiSummaryReady {
  status: "ready";
  entityType: AiSummaryEntityType;
  name: string;
  overview: string;
  highlights: string[];
  aiGenerated: true;
  cached: boolean;
  generatedAt: string;
  modelVersion: string;
  source: { label: string; sources: string[]; confidence: string | null; lastUpdated: string | null };
}
export interface AiSummaryUnavailable {
  status: "unavailable";
  entityType: AiSummaryEntityType;
  name: string;
  reason: "insufficient_data" | "provider_not_configured";
}
export type AiSummaryResult = AiSummaryReady | AiSummaryUnavailable;

/** GET /api/ai-summaries/:type/:id — signed-in users only; `id` is the organization's slug (what the directories use as `id`). */
export const fetchAiSummary = (type: AiSummaryEntityType, id: string) =>
  api.get<AiSummaryResult>(`/ai-summaries/${type}/${encodeURIComponent(id)}`);
