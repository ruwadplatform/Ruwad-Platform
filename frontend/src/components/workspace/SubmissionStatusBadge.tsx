import type { ApiSubmissionStatus } from "@/lib/api/types";

export const SUBMISSION_STATUS_LABEL: Record<ApiSubmissionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVED: "Approved",
  REJECTED: "Not Approved",
};

const CLASS: Record<ApiSubmissionStatus, string> = {
  DRAFT: "badge-neutral",
  SUBMITTED: "badge-info",
  UNDER_REVIEW: "badge-info",
  CHANGES_REQUESTED: "badge-warn",
  APPROVED: "badge-good",
  REJECTED: "badge-crit",
};

export function SubmissionStatusBadge({ status }: { status: ApiSubmissionStatus }) {
  return <span className={`badge ${CLASS[status]}`}>{SUBMISSION_STATUS_LABEL[status]}</span>;
}
