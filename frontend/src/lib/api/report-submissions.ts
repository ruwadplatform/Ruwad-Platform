import { API_BASE, ApiError, api } from "./client";

export type SubmissionStatus = "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
export const STATUS_LABEL: Record<SubmissionStatus, string> = { PENDING_REVIEW: "Pending Review", PUBLISHED: "Published", REJECTED: "Rejected" };

export interface SourceLink { title: string; url: string }

export interface SubmitReportInput {
  idempotencyKey: string;
  title: string; reportType: string; sector: string; geography: string; publicationDate?: string;
  description: string; executiveSummary: string;
  authorName: string; organizationName: string; authorEmail: string; website?: string; linkedin?: string;
  reportUrl?: string; fileId?: string; sources: SourceLink[]; declaration: boolean;
}

export interface MySubmission {
  id: string; title: string; status: SubmissionStatus; submittedAt: string; reviewedAt: string | null;
  reportType: string; sector: string; geography: string; publicationDate: string | null;
  description: string; executiveSummary: string; authorName: string; organizationName: string;
  reportUrl: string | null; hasFile: boolean; sources: SourceLink[]; rejectionReason: string | null; reportSlug: string | null;
}

export interface ReviewInfo {
  title: string; reportType: string; sector: string; geography: string; publicationDate: string | null;
  authorName: string; organizationName: string; description: string; executiveSummary: string;
  sources: SourceLink[]; reportUrl: string | null; hasFile: boolean; submittedAt: string; expiresAt: string;
}

export interface AdminSubmissionRow {
  id: string; title: string; status: SubmissionStatus; submittedAt: string; authorName: string; organizationName: string;
  reviewEmailSentAt: string | null; reviewEmailAttempts: number; reviewedAt: string | null; reviewAction: "ACCEPT" | "REJECT" | null;
}

/** PDF upload — multipart, so it bypasses the JSON `api` helper (same approach as uploadLogo). The file stays private until approved. */
export async function uploadReportPdf(file: File): Promise<{ fileId: string; fileName: string; size: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/reports/submissions/file`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    if (res.status === 413) throw new ApiError(413, "The PDF must be 10 MB or smaller.");
    let message = res.statusText || `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch { /* keep the status-text fallback */ }
    throw new ApiError(res.status, message);
  }
  return res.json();
}

export const submitReport = (input: SubmitReportInput) => api.post<MySubmission>("/reports/submissions", input);
export const fetchMySubmissions = () => api.get<MySubmission[]>("/reports/my-submissions");
export const fetchMySubmission = (id: string) => api.get<MySubmission>(`/reports/my-submissions/${id}`);

export const fetchReviewInfo = (token: string) => api.get<ReviewInfo>(`/reports/review/${encodeURIComponent(token)}`);
export const acceptReview = (token: string) => api.post<{ status: SubmissionStatus; title: string; reportSlug: string | null }>(`/reports/review/${encodeURIComponent(token)}/accept`);
export const rejectReview = (token: string, reason?: string) => api.post<{ status: SubmissionStatus; title: string }>(`/reports/review/${encodeURIComponent(token)}/reject`, { reason: reason?.trim() || undefined });

export const fetchAdminSubmissions = () => api.get<AdminSubmissionRow[]>("/reports/submissions/admin");
export const resendReviewEmail = (id: string) => api.post<{ sent: boolean }>(`/reports/submissions/${id}/resend-review-email`);

export const publishedReportFileUrl = (fileId: string) => `${API_BASE}/reports/file/${fileId}`;
export const mySubmissionFileUrl = (id: string) => `${API_BASE}/reports/my-submissions/${id}/file`;
export const reviewFileUrl = (token: string) => `${API_BASE}/reports/review/${encodeURIComponent(token)}/file`;
