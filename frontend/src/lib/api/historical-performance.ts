import { api } from "./client";
import type { ReadinessReport } from "./ml-data";

// ---- Phase 3A — founder "Historical Performance" entries, admin review, Readiness V2 dashboard ----
// Everything here is private/internal: owner-or-admin only on the founder routes,
// admin-only on the review and dashboard routes. Nothing feeds a public profile.

export type HistoricalSubmissionKind =
  | "REVENUE" | "CUSTOMER_METRIC" | "TEAM_SIZE" | "FOUNDER_CAREER" | "REGULATORY_APPLICABILITY" | "REGULATORY_MILESTONE" | "FUNDING_ROUND" | "COVERAGE_ATTESTATION";
export type HistoricalReviewStatus = "PENDING_REVIEW" | "CHANGES_REQUESTED" | "VERIFIED" | "REJECTED";

export interface HistoricalOptions {
  kinds: HistoricalSubmissionKind[];
  revenueTypes: string[];
  customerMetricTypes: string[];
  currencies: string[];
  supportingDocumentTypes: string[];
  regulatoryAnswers: string[];
  regulatoryLadder: string[];
  attestableFamilies: string[];
}

/** What the founder sees of their own entry (no reviewer identity or internals). */
export interface FounderHistoricalEntry {
  id: string;
  kind: HistoricalSubmissionKind;
  payload: Record<string, unknown>;
  effectiveDate: string;
  reviewStatus: HistoricalReviewStatus;
  reviewNotes: string | null;
  supportingDocumentId: string | null;
  supportingDocumentType: string | null;
  founderNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface SubmitHistoricalEntryInput {
  kind: HistoricalSubmissionKind;
  entry: Record<string, unknown>;
  supportingDocumentId?: string;
  supportingDocumentType?: string;
  founderNote?: string;
}

export const fetchHistoricalOptions = (startupId: string) => api.get<HistoricalOptions>(`/startups/${startupId}/historical-data/options`);
export const fetchMyHistoricalEntries = (startupId: string) => api.get<FounderHistoricalEntry[]>(`/startups/${startupId}/historical-data`);
export const submitHistoricalEntry = (startupId: string, input: SubmitHistoricalEntryInput) => api.post<FounderHistoricalEntry>(`/startups/${startupId}/historical-data`, input);
export const reviseHistoricalEntry = (startupId: string, entryId: string, input: Omit<SubmitHistoricalEntryInput, "kind">) => api.put<FounderHistoricalEntry>(`/startups/${startupId}/historical-data/${entryId}`, input);
export const withdrawHistoricalEntry = (startupId: string, entryId: string) => api.delete<void>(`/startups/${startupId}/historical-data/${entryId}`);

// ---- admin review ----

export interface ReviewQueueRow {
  id: string;
  startupId: string;
  startupName: string | null;
  kind: HistoricalSubmissionKind;
  payload: Record<string, unknown>;
  effectiveDate: string;
  source: string;
  reviewStatus: HistoricalReviewStatus;
  supportingDocumentId?: string | null;
  supportingDocumentType?: string | null;
  founderNote?: string | null;
  createdAt: string;
}

export interface PlannedWrites {
  evidence: { fieldKey: string; valueNumeric?: number; valueText?: string; currency?: string; effectiveDate: string; note?: string }[];
  event?: { eventType: string; eventDate: string; valueNumeric?: number; valueText?: string; notes?: string };
  applicability?: { featureKey: string; status: string; effectiveDate: string; reason?: string };
  career?: { founderName: string; careerStartYear: number; domainStartYear?: number };
  coverage?: { coverageType: string; coverageThrough: string; sourceSummary: string };
  notes: string[];
}

export interface ReviewDetail {
  submission: ReviewQueueRow & { reviewNotes?: string | null };
  startup: { id: string; name: string; category: string; founded: number; foundedBasis: string };
  provenance: { submittedSource: string; wouldBecome: string };
  supportingDocument: { id: string; name: string; onFile: boolean; type?: string } | null;
  plannedWrites: PlannedWrites;
  conflicts: { fieldKey: string; effectiveDate: string; existingValue: unknown; newValue: unknown; existingSource: string; existingVerified: boolean }[];
  duplicates: { source: string; id: string; date: string; amount?: number; round?: string; match: "EXACT" | "NEARBY" }[];
}

export type ReviewAction = "VERIFY" | "REJECT" | "REQUEST_CORRECTION";

export const fetchReviewQueue = (status: HistoricalReviewStatus = "PENDING_REVIEW") => api.get<ReviewQueueRow[]>(`/ml-data/historical/submissions?status=${status}`);
export const fetchReviewDetail = (id: string) => api.get<ReviewDetail>(`/ml-data/historical/submissions/${id}`);
export const reviewHistoricalEntry = (id: string, body: { action: ReviewAction; notes?: string; documentValidated?: boolean; confirmNotDuplicate?: boolean }) =>
  api.post<{ conflictsCreated: number }>(`/ml-data/historical/submissions/${id}/review`, body);

// ---- Readiness V2 dashboard ----

export interface ReadinessDashboard {
  generatedAt: string;
  focusTarget: string;
  snapshots: { total: number; eligible: number; analysisOnly: number; excluded: number; byMethod: Record<string, number> };
  readinessV2: ReadinessReport & { perFeature?: { key: string; withValue: number; applicableMissing: number; unknown: number; notApplicable: number }[]; coverageCells?: { covered: number; applicable: number; notApplicable: number } };
  readinessV1: ReadinessReport;
  gap: { usableNeeded: number; positiveNeeded: number; negativeNeeded: number; coverageGapPoints: number };
  featureApplicability: { key: string; withValue: number; applicableMissing: number; unknown: number; notApplicable: number }[];
  evidence: { total: number; verified: number; verifiedPct: number; openConflicts: number };
  outcomeCoverage: { family: string; startupsAttested: number; totalStartups: number; latestThrough: string | null; earliestThrough: string | null }[];
  labels: { target: string; coverageFamily: string; valueType: string; positive: number; negative: number; unknown: number; notMatured: number; insufficientData: number; unverified: number; excluded: number }[];
  submissions: { pendingReview: number; changesRequested: number; verified: number; rejected: number };
  caveats: { unverifiedShutdownEvents: number; estimatedFoundingYears: number; legacyOutcomeAwareSnapshots: number; undeclaredSnapshots: number };
}

export const fetchReadinessDashboard = () => api.get<ReadinessDashboard>("/ml-data/historical/readiness-dashboard");
