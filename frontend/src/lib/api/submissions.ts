import { api } from "./client";
import type { ApiSubmission, ApiSubmissionKind, ApiSubmissionKpis, ApiSubmissionReviewEvent } from "./types";

export function fetchMySubmissions(): Promise<ApiSubmission[]> {
  return api.get<ApiSubmission[]>("/submissions");
}
export function fetchSubmission(id: string): Promise<ApiSubmission> {
  return api.get<ApiSubmission>(`/submissions/${id}`);
}
export function fetchSubmissionHistory(id: string): Promise<ApiSubmissionReviewEvent[]> {
  return api.get<ApiSubmissionReviewEvent[]>(`/submissions/${id}/history`);
}
export function createSubmission(kind: ApiSubmissionKind): Promise<ApiSubmission> {
  return api.post<ApiSubmission>("/submissions", { kind });
}
export function updateSubmission(id: string, patch: { payload?: Record<string, unknown>; currentStep?: string; completionPercentage?: number; title?: string }): Promise<ApiSubmission> {
  return api.patch<ApiSubmission>(`/submissions/${id}`, patch);
}
export function deleteSubmission(id: string): Promise<void> {
  return api.delete<void>(`/submissions/${id}`);
}
export function submitSubmission(id: string): Promise<ApiSubmission> {
  return api.post<ApiSubmission>(`/submissions/${id}/submit`);
}

/* ------------------------------------------------------------------- admin */
export interface AdminSubmissionQuery {
  status?: string;
  kind?: string;
  search?: string;
  order?: "asc" | "desc";
}
export function fetchAdminSubmissions(query: AdminSubmissionQuery): Promise<ApiSubmission[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.kind) params.set("kind", query.kind);
  if (query.search) params.set("search", query.search);
  if (query.order) params.set("order", query.order);
  const qs = params.toString();
  return api.get<ApiSubmission[]>(`/submissions/admin/all${qs ? `?${qs}` : ""}`);
}
export function fetchAdminSubmissionKpis(): Promise<ApiSubmissionKpis> {
  return api.get<ApiSubmissionKpis>("/submissions/admin/kpis");
}
export function fetchAdminSubmission(id: string): Promise<ApiSubmission> {
  return api.get<ApiSubmission>(`/submissions/admin/${id}`);
}
export function fetchAdminSubmissionHistory(id: string): Promise<ApiSubmissionReviewEvent[]> {
  return api.get<ApiSubmissionReviewEvent[]>(`/submissions/admin/${id}/history`);
}
export function startReview(id: string): Promise<ApiSubmission> {
  return api.post<ApiSubmission>(`/submissions/admin/${id}/start-review`);
}
export function requestChanges(id: string, message: string, section?: string): Promise<ApiSubmission> {
  return api.post<ApiSubmission>(`/submissions/admin/${id}/request-changes`, { message, section });
}
export function approveSubmission(id: string): Promise<ApiSubmission> {
  return api.post<ApiSubmission>(`/submissions/admin/${id}/approve`);
}
export function rejectSubmission(id: string, reason: string, internalNote?: string): Promise<ApiSubmission> {
  return api.post<ApiSubmission>(`/submissions/admin/${id}/reject`, { reason, internalNote });
}
