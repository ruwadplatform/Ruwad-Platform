import { api, isNotFound } from "./client";

export type ClaimEntityKind = "STARTUP" | "INVESTOR" | "HUB" | "RESEARCH" | "MULTINATIONAL";
export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Claim {
  id: string;
  userId: string;
  kind: ClaimEntityKind;
  entityId: string;
  role: string;
  note: string;
  status: ClaimStatus;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminClaimRow extends Claim {
  entityName: string | null;
  claimantEmail: string | null;
}

/** The signed-in user's own claim, if a claim of theirs is currently pending. Mirrors "one company claim per account". */
export async function fetchMyClaim(): Promise<Claim | null> {
  try {
    const claim = await api.get<Claim | null>("/organizations/claims/mine");
    return claim ?? null;
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export const fetchPendingClaim = (kind: ClaimEntityKind, entityId: string) =>
  api.get<{ pending: boolean }>(`/organizations/claims/pending?kind=${kind}&entityId=${entityId}`).then((r) => r.pending);

export const submitClaim = (kind: ClaimEntityKind, entityId: string, role: string, note?: string) =>
  api.post<Claim>("/organizations/claims", { kind, entityId, role, note });

/* ---- Admin only (the backend enforces the role; these just call it) ---- */

export const fetchAdminClaims = () => api.get<AdminClaimRow[]>("/organizations/claims/admin/all");
export const approveClaim = (id: string) => api.post<Claim>(`/organizations/claims/${id}/approve`);
export const rejectClaim = (id: string, reason?: string) => api.post<Claim>(`/organizations/claims/${id}/reject`, { reason });
