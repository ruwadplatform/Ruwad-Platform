import { API_BASE, ApiError, api } from "./client";

export type LabelStatus = "NOT_MATURED" | "AVAILABLE" | "INSUFFICIENT_DATA" | "UNVERIFIED" | "EXCLUDED" | "COVERAGE_UNATTESTED";
export type StartupOutcomeEventType =
  | "FUNDING_ROUND" | "REVENUE_UPDATE" | "CUSTOMER_COUNT_UPDATE" | "ACTIVE_USERS_UPDATE" | "REGULATORY_MILESTONE"
  | "REGULATORY_APPROVAL" | "COMMERCIAL_LAUNCH" | "PARTNERSHIP_SIGNED" | "MARKET_ENTRY" | "TEAM_SIZE_UPDATE"
  | "SHUTDOWN" | "ACQUISITION" | "IPO" | "OTHER";
export type OutcomeEventSource = "FOUNDER_REPORTED" | "ADMIN_ENTERED" | "VERIFIED_DOCUMENT" | "PUBLIC_SOURCE" | "SYSTEM_DERIVED";

export interface OutcomeEvent {
  id: string;
  startupId: string;
  eventType: StartupOutcomeEventType;
  eventDate: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  source: OutcomeEventSource;
  verified: boolean;
  sourceDocumentId?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
}

export interface CreateOutcomeEventInput {
  eventType: StartupOutcomeEventType;
  eventDate: string;
  valueNumeric?: number;
  valueText?: string;
  source: OutcomeEventSource;
  verified?: boolean;
  sourceDocumentId?: string;
  sourceUrl?: string;
  notes?: string;
}

export interface ChartDatum { l: string; v: number }

export interface StartupCoverageReport {
  totalPublishedStartups: number;
  with4PlusFactors: number;
  with50PlusConfidence: number;
  with70PlusConfidence: number;
  withComplete12MonthHistory: number;
  withMature12MonthLabels: number;
  byCategory: ChartDatum[];
  byStage: ChartDatum[];
  byFoundedYear: ChartDatum[];
  byCountry: ChartDatum[];
}

export interface FeatureCoverageStat {
  key: string;
  rowCount: number;
  nonNullCount: number;
  missingPct: number;
  uniqueCount: number;
  isCategorical: boolean;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  outlierCount?: number;
  categoryDistribution?: { value: string; count: number }[];
  verifiedPct: number;
}

export interface DataQualityIssue {
  kind: string;
  startupId: string;
  snapshotId?: string;
  detail: string;
}

export interface ClassBalanceReport {
  target: string;
  targetVersion: string;
  windowMonths: number;
  valueType: "boolean" | "numeric";
  positive: number;
  negative: number;
  notMatured: number;
  insufficientData: number;
  /** Readiness V2 counts (training-eligible snapshots, attested-coverage negatives). Absent on an older backend. */
  unknown?: number;
  unverified?: number;
  excluded?: number;
  snapshotsConsidered?: number;
  labelMode?: "V1" | "V2";
}

export interface ReadinessReport {
  readinessVersion?: number;
  ready: boolean;
  target: string;
  usableExamples: number;
  positiveExamples: number;
  negativeExamples: number;
  featureCoverage: number;
  reasons: string[];
  warnings?: string[];
  trainingEligibleSnapshots?: number;
  analysisOnlySnapshots?: number;
  excludedSnapshots?: number;
  unknownExamples?: number;
  featureCoverageAllEligible?: number;
  thresholds?: { minTrainingRows: number; minPositiveRows: number; minNegativeRows: number; minCoreFeatureCoverage: number };
}

export interface TargetMeta {
  name: string;
  group: string;
  targetVersion: string;
  windowMonths: number;
  valueType: "boolean" | "numeric";
}

export interface BackfillSnapshotRow { startupId: string; name: string; created: boolean }

export const fetchMlTargets = () => api.get<TargetMeta[]>("/ml-data/targets");
export const fetchMlCoverage = () => api.get<StartupCoverageReport>("/ml-data/coverage");
export const fetchMlFeatureCoverage = () => api.get<FeatureCoverageStat[]>("/ml-data/quality/feature-coverage");
export const fetchMlQualityIssues = () => api.get<DataQualityIssue[]>("/ml-data/quality/issues");
export const fetchMlClassBalanceAll = () => api.get<ClassBalanceReport[]>("/ml-data/class-balance");
export const fetchMlReadiness = (target: string) => api.get<ReadinessReport>(`/ml-data/readiness/${target}`);
export const runMlSnapshotBackfill = () => api.post<BackfillSnapshotRow[]>("/ml-data/snapshot-backfill");
export const forceMlSnapshot = (startupId: string) => api.post(`/ml-data/startups/${startupId}/snapshot`);

export const fetchStartupOutcomeEvents = (startupId: string) => api.get<OutcomeEvent[]>(`/ml-data/startups/${startupId}/outcomes`);
export const createStartupOutcomeEvent = (startupId: string, input: CreateOutcomeEventInput) =>
  api.post<OutcomeEvent>(`/ml-data/startups/${startupId}/outcomes`, input);

// ---- Phase 2A — ML training framework (models, training runs, shadow predictions) ----
// See docs/ml-training-methodology.md. None of this ever touches the public
// RUWĀD Score — it's internal tooling for reviewing/promoting shadow models.

export type MlModelStatus = "TEST_ONLY" | "EXPERIMENTAL" | "CANDIDATE" | "SHADOW" | "ACTIVE" | "RETIRED" | "REJECTED";
export type MlTrainingRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED_NOT_READY";
export type MlPredictionType = "PROBABILITY" | "REGRESSION_VALUE";

export interface MlModel {
  id: string;
  modelVersion: string;
  targetName: string;
  targetVersion: string;
  featureSchemaVersion: string;
  algorithm: string;
  hyperparameters: Record<string, unknown>;
  trainingRows: number;
  validationRows: number;
  testRows: number;
  trainingPeriodStart?: string | null;
  trainingPeriodEnd?: string | null;
  metrics: Record<string, unknown>;
  status: MlModelStatus;
  artifactLocation: string;
  isTestOnly: boolean;
  trainedAt: string;
}

export interface MlTrainingRun {
  id: string;
  targetName: string;
  targetVersion: string;
  featureSchemaVersion: string;
  algorithm: string;
  status: MlTrainingRunStatus;
  startedAt: string;
  completedAt?: string | null;
  datasetRows?: number | null;
  metrics: Record<string, unknown>;
  hyperparameters: Record<string, unknown>;
  modelVersion?: string | null;
  artifactLocation?: string | null;
  errorMessage?: string | null;
  createdBy: string;
  isTestOnly: boolean;
}

export interface MlPrediction {
  id: string;
  startupId: string;
  snapshotId: string;
  targetName: string;
  targetVersion: string;
  modelVersion: string;
  prediction: number;
  predictionType: MlPredictionType;
  predictedAt: string;
  modelStatus: MlModelStatus;
  actualOutcome?: number | null;
  evaluatedAt?: string | null;
}

export const fetchMlModels = () => api.get<MlModel[]>("/ml-data/models");
export const updateMlModelStatus = (id: string, status: MlModelStatus) => api.patch<MlModel>(`/ml-data/models/${id}/status`, { status });
export const fetchMlTrainingRuns = () => api.get<MlTrainingRun[]>("/ml-data/training-runs");
export const fetchStartupShadowPredictions = (startupId: string) => api.get<MlPrediction[]>(`/ml-data/predictions?startupId=${startupId}`);
export const evaluateMaturedShadowPredictions = () => api.post<{ evaluated: number; stillImmature: number }>("/ml-data/predictions/evaluate");

export interface ExportFilters {
  target: string;
  format?: "csv" | "json";
  minConfidence?: number;
  verifiedOnly?: boolean;
  includeIdentifiers?: boolean;
  includeImmature?: boolean;
  /** Audit only: also return ANALYSIS_ONLY (e.g. legacy outcome-aware) snapshots. Never used for training. */
  includeAnalysisOnly?: boolean;
}

/** Downloads the dataset export directly to the browser — same
 * Blob-and-temporary-anchor pattern as lib/calendar.ts's downloadIcs(),
 * the one client-side file-download precedent in this app. Uses a raw
 * fetch rather than the shared `api` client since that always parses JSON;
 * this response is a file. */
export async function downloadMlDatasetExport(filters: ExportFilters): Promise<void> {
  const params = new URLSearchParams();
  params.set("target", filters.target);
  params.set("format", filters.format ?? "csv");
  if (filters.minConfidence != null) params.set("minConfidence", String(filters.minConfidence));
  if (filters.verifiedOnly) params.set("verifiedOnly", "true");
  if (filters.includeIdentifiers === false) params.set("includeIdentifiers", "false");
  if (filters.includeImmature) params.set("includeImmature", "true");
  if (filters.includeAnalysisOnly) params.set("includeAnalysisOnly", "true");

  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  const res = await fetch(`${base}/ml-data/export?${params.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `ruwad-ml-${filters.target}.${filters.format ?? "csv"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// ---- Phase 3 — historical data acquisition & import ----
// See docs (ml-training-methodology.md's sibling). Reconstructs REAL
// historical ML examples from sourced evidence — never synthetic, never
// bypasses the readiness gate, never touches the public RUWĀD Score.

export type HistoricalEvidenceSourceType =
  | "FOUNDER_REPORTED" | "ADMIN_ENTERED" | "VERIFIED_DOCUMENT" | "PUBLIC_COMPANY_SOURCE" | "PUBLIC_REGULATORY_SOURCE"
  | "PUBLIC_NEWS_SOURCE" | "LICENSED_DATABASE" | "RESEARCH_DATABASE" | "PATENT_DATABASE" | "CLINICAL_TRIAL_REGISTRY" | "SYSTEM_DERIVED";
export type SourceReliability = "PRIMARY" | "HIGH" | "MEDIUM" | "LOW";
export type EvidenceStatus = "NO_CONFLICT" | "PREFERRED" | "CONFLICT" | "SUPERSEDED" | "REJECTED";
export type ImportBatchStatus = "UPLOADED" | "VALIDATING" | "DRY_RUN_COMPLETE" | "IMPORTING" | "COMPLETED" | "PARTIAL" | "FAILED";
export type IdentityMatchedBy = "EXTERNAL_ID" | "DOMAIN" | "ALIAS" | "NORMALIZED_NAME" | "FUZZY_REVIEW" | "MANUAL";
export type IdentityMatchStatus = "MATCHED" | "UNMATCHED" | "POSSIBLE_DUPLICATE" | "REVIEW_REQUIRED";

export interface HistoricalImportBatch {
  id: string;
  sourceName: string;
  sourceType: HistoricalEvidenceSourceType;
  fileName: string;
  importedAt: string;
  importedBy: string;
  status: ImportBatchStatus;
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  rowsNeedsReview: number;
  dryRun: boolean;
  notes?: string | null;
  summaryJson?: { invalidRows?: { rowNumber: number; message: string }[]; unmatched?: { rowNumber: number; startupName: string; matchStatus: IdentityMatchStatus; matchConfidence?: number }[] } | null;
}

export interface StartupExternalIdentity {
  id: string;
  startupId?: string | null;
  sourceName: string;
  externalId?: string | null;
  externalUrl?: string | null;
  companyNameAtSource: string;
  domain?: string | null;
  matchedBy?: IdentityMatchedBy | null;
  matchConfidence?: number | null;
  matchStatus: IdentityMatchStatus;
  verified: boolean;
}

export interface HistoricalEvidence {
  id: string;
  startupId: string;
  importBatchId?: string | null;
  fieldKey: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  currency?: string | null;
  effectiveDate: string;
  publishedAt?: string | null;
  sourceType: HistoricalEvidenceSourceType;
  sourceName?: string | null;
  sourceUrl?: string | null;
  verified: boolean;
  verificationNotes?: string | null;
  reliability: SourceReliability;
  status: EvidenceStatus;
  cohortSource?: string | null;
  collectedAt: string;
}

export interface HistoricalCohort {
  id: string;
  name: string;
  region?: string | null;
  category?: string | null;
  snapshotDate?: string | null;
  sourceDescription?: string | null;
}

export interface HistoricalCohortMember { id: string; cohortId: string; startupId: string }

export interface SnapshotPreview {
  startupId: string;
  snapshotDate: string;
  features: Record<string, number | string | boolean>;
  unresolvedFields: string[];
  populatedCoreFeatures: number;
  coreFeatureCount: number;
  coveragePct: number;
  conflictCount: number;
  dataConfidence: number;
  alreadyExists: boolean;
}

export interface BulkSnapshotReport {
  cohortId: string;
  snapshotDate: string;
  eligible: number;
  skippedAlreadyExists: number;
  averageCoveragePct: number;
  totalConflicts: number;
  perStartup: SnapshotPreview[];
}

export interface HistoricalDashboardMetrics {
  companiesMatched: number;
  companiesUnmatched: number;
  companiesReviewRequired: number;
  snapshotsCreated: number;
  snapshotsWithCoreCoverage: number;
  matureLabelsByWindow: Record<number, number>;
  evidenceConflicts: number;
  verifiedEvidencePct: number;
  perFeatureCoverage: { key: string; coveragePct: number }[];
  perSourceTypeCounts: { sourceType: string; rows: number }[];
}

export const fetchHistoricalBatches = () => api.get<HistoricalImportBatch[]>("/ml-data/historical/batches");
export const fetchHistoricalBatch = (id: string) => api.get<HistoricalImportBatch>(`/ml-data/historical/batches/${id}`);
export const commitHistoricalBatch = (id: string) => api.post<HistoricalImportBatch>(`/ml-data/historical/batches/${id}/commit`);
export const retryHistoricalBatchRows = (id: string) => api.post<{ committed: number; stillPending: number }>(`/ml-data/historical/batches/${id}/retry`);

export const fetchHistoricalIdentitiesNeedingReview = () => api.get<StartupExternalIdentity[]>("/ml-data/historical/identities");
export const confirmHistoricalMatch = (identityId: string, startupId: string) => api.post<StartupExternalIdentity>(`/ml-data/historical/identities/${identityId}/confirm`, { startupId });
export const rejectHistoricalMatch = (identityId: string) => api.post<StartupExternalIdentity>(`/ml-data/historical/identities/${identityId}/reject`);
export interface CreateStartupForIdentityInput { category: string; subsector: string; country: string; founded: number; stage: string; tagline?: string }
export const createStartupForIdentity = (identityId: string, input: CreateStartupForIdentityInput) => api.post(`/ml-data/historical/identities/${identityId}/create-startup`, input);

export const fetchHistoricalConflicts = () => api.get<HistoricalEvidence[]>("/ml-data/historical/evidence/conflicts");
export const resolveHistoricalConflict = (preferredId: string, reason: string) => api.post<HistoricalEvidence>("/ml-data/historical/evidence/resolve", { preferredId, reason });
export const leaveHistoricalConflictUnresolved = (evidenceId: string, reason: string) => api.post(`/ml-data/historical/evidence/${evidenceId}/leave-unresolved`, { reason });

export const previewHistoricalSnapshot = (startupId: string, snapshotDate: string) => api.get<SnapshotPreview>(`/ml-data/historical/startups/${startupId}/snapshot-preview?snapshotDate=${snapshotDate}`);
export const buildHistoricalSnapshot = (startupId: string, snapshotDate: string, reason?: string) => api.post(`/ml-data/historical/startups/${startupId}/snapshots`, { snapshotDate, reason });

export const fetchHistoricalCohorts = () => api.get<HistoricalCohort[]>("/ml-data/historical/cohorts");
export const createHistoricalCohort = (input: { name: string; region?: string; category?: string; snapshotDate?: string; sourceDescription?: string }) => api.post<HistoricalCohort>("/ml-data/historical/cohorts", input);
export const fetchHistoricalCohortMembers = (cohortId: string) => api.get<HistoricalCohortMember[]>(`/ml-data/historical/cohorts/${cohortId}/members`);
export const addHistoricalCohortMember = (cohortId: string, startupId: string) => api.post<HistoricalCohortMember>(`/ml-data/historical/cohorts/${cohortId}/members`, { startupId });
export const previewHistoricalCohortSnapshots = (cohortId: string, snapshotDate: string) => api.post<BulkSnapshotReport>(`/ml-data/historical/cohorts/${cohortId}/snapshots/preview`, { snapshotDate });
export const buildHistoricalCohortSnapshots = (cohortId: string, snapshotDate: string, reason?: string) => api.post<BulkSnapshotReport>(`/ml-data/historical/cohorts/${cohortId}/snapshots`, { snapshotDate, reason });

export const fetchHistoricalDashboard = () => api.get<HistoricalDashboardMetrics>("/ml-data/historical/dashboard");

export function downloadHistoricalTemplate(kind: "features" | "outcomes" | "identities"): void {
  const a = document.createElement("a");
  a.href = `${API_BASE}/ml-data/historical/templates/${kind}`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Multipart upload with progress (fetch can't report upload progress) —
 * same XHR pattern as lib/api/submission-autofill.ts's autofillSubmission(). */
export function uploadHistoricalBatch(
  file: File, meta: { sourceName: string; sourceType: HistoricalEvidenceSourceType; dryRun: boolean },
  handlers: { onUploadProgress?: (fraction: number) => void } = {},
): Promise<HistoricalImportBatch> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("sourceName", meta.sourceName);
    form.append("sourceType", meta.sourceType);
    form.append("dryRun", String(meta.dryRun));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/ml-data/historical/batches`);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.timeout = 5 * 60 * 1000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) handlers.onUploadProgress?.(e.loaded / e.total); };
    xhr.onerror = () => reject(new ApiError(0, "Couldn't reach the server. Check your connection and try again."));
    xhr.ontimeout = () => reject(new ApiError(0, "The upload took too long. Please try again."));
    xhr.onload = () => {
      let body: (HistoricalImportBatch & { message?: string | string[] }) | null = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { body = null; }
      if (xhr.status >= 200 && xhr.status < 300 && body) return resolve(body);
      const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
      reject(new ApiError(xhr.status, message || "Unable to process the file."));
    };
    xhr.send(form);
  });
}
